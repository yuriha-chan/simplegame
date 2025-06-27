const canvas = document.getElementById('game-canvas');
const gl = canvas.getContext('webgl');
const resolution = 2;
canvas.width = window.innerWidth/resolution;
canvas.height = window.innerHeight/resolution;
let aspect = canvas.width / canvas.height;

canvas.style.width = window.innerWidth + "px";
canvas.style.height = window.innerHeight + "px";
gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

// --- シェーダー (フラグメントシェーダーベースに改造) ---
const vsSource = `
    attribute vec4 aVertexPosition;
    void main() {
        gl_Position = aVertexPosition;
    }
`;

const fsSource = `
precision mediump float;

uniform vec2 uResolution;
uniform float uTime;

// Game Objects Data
uniform vec3 uPlayer; // {x, y, size}
uniform vec3 uEnemy;  // {x, y, size}
uniform float uEnemyBarrierState; // 0: none, 1: active, 0.x: preparing
uniform float uEnemyHpRatio;
uniform float uPlayerHpRatio;

// Bullets Data
const int MAX_BULLETS = 32;
uniform vec3 uBullets[MAX_BULLETS]; // {x, y, size}
uniform int uNumBullets;

// SDF (Signed Distance Function) to define shapes
float sdCircle(vec2 p, float r) {
    return length(p) - r;
}

float sdBox( in vec2 p, in vec2 b ) {
    vec2 d = abs(p)-b;
    return length(max(d,vec2(0))) + min(max(d.x,d.y),0.0);
}
    
// Function to blend colors based on distance
// 距離に基づいて色をブレンドする関数。smoothstepの第2引数を0.005に広げることで、境界が少し柔らかくなります。
vec3 blendSDFColor(vec3 baseColor, vec3 objectColor, float dist) {
    return mix(baseColor, objectColor, 1.0 - smoothstep(0.0, 0.005, dist));
}
vec3 blendSDFColor2(vec3 baseColor, vec3 objectColor, vec3 coreColor, float dist, float a) {
    return mix(mix(baseColor, objectColor, 1.0 - smoothstep(0.0, 0.003, dist)), coreColor, 1.0 - smoothstep(-a, 0.5*a, dist));
}

void main() {
    // Normalize coordinates and correct aspect ratio
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    uv.y = 1.0 - uv.y; // Flip Y

    // アスペクト比を事前に計算し、stに適用
    float aspect = uResolution.x / uResolution.y;
    vec2 st = vec2(uv.x * aspect, uv.y);

    // Background color
    vec3 color = vec3(0.05, 0.05, 0.1);

    // --- 1. HP Bar ---
    vec2 hpBarTotalSize = vec2(0.3, 0.01);
    vec2 hpBarCenter = vec2(0.5 * aspect, 0.03); // st空間に合わせる
    
    // HP Bar Background
    float hpBgDist = sdBox(st - hpBarCenter, hpBarTotalSize);
    color = blendSDFColor(color, vec3(0.3, 0.0, 0.0), hpBgDist);
    
    // HP Bar Foreground
    float fgWidth = hpBarTotalSize.x * uEnemyHpRatio;
    vec2 fgSize = vec2(fgWidth, hpBarTotalSize.y);
    vec2 fgCenter = hpBarCenter - vec2(hpBarTotalSize.x - fgWidth, 0.0);
    float hpFgDist = sdBox(st - fgCenter, fgSize);
    color = blendSDFColor(color, vec3(1.0, 0.2, 0.2), hpFgDist);


    // --- 1. HP Bar ---
    hpBarTotalSize = vec2(0.3, 0.01);
    hpBarCenter = vec2(0.5 * aspect, 0.95); // st空間に合わせる
    
    hpBgDist = sdBox(st - hpBarCenter, hpBarTotalSize);
    color = blendSDFColor(color, vec3(0.3, 0.0, 0.0), hpBgDist);
    
    fgWidth = hpBarTotalSize.x * uPlayerHpRatio;
    fgSize = vec2(fgWidth, hpBarTotalSize.y);
    fgCenter = hpBarCenter - vec2(hpBarTotalSize.x - fgWidth, 0.0);
    hpFgDist = sdBox(st - fgCenter, fgSize);
    color = blendSDFColor(color, vec3(0.2, 1.0, 0.2), hpFgDist);
	
    // --- 2. Barrier ---
    // オブジェクトの位置もaspectを考慮して変換
    vec2 enemyPos = vec2(uEnemy.x * aspect, uEnemy.y);
    if (0. < uEnemyBarrierState && uEnemyBarrierState < 1.) { // Predict
        float alpha = 0.5 + 0.5 * sin(uTime * 8.0);
        float barrierDist = sdCircle(st - enemyPos, uEnemy.z + 0.05 * uEnemyBarrierState);
        // smoothstepの範囲を少し広げて境界を柔らかく
        color = mix(color, vec3(1.0, 1.0, 0.0), alpha * (1.0 - smoothstep(0.0, 0.005, barrierDist)));
    } else if (uEnemyBarrierState == 1.) { // Active
        float barrierDist = sdCircle(st - enemyPos, uEnemy.z + 0.05);
		float t = 6. * (st.x - enemyPos.x);
        color = blendSDFColor2(color, mix(vec3(0.5, 1.0, 1.0), vec3(0.2, 0.0, 1.0), t*t), color, barrierDist, 0.05);
    }

    // --- 3. Enemy ---
    float enemyDist = sdCircle(st - enemyPos, uEnemy.z);
    color = blendSDFColor(color, vec3(1.0, 0.3, 0.3), enemyDist);

    // --- 4. Player ---
    vec2 playerPos = vec2(uPlayer.x * aspect, uPlayer.y);
    float playerDist = sdCircle(st - playerPos, uPlayer.z);
    color = blendSDFColor(color, vec3(0.5, 0.9, 1.0), playerDist);

    // --- 5. Bullets ---
    float bulletsDist = 999.0;
    // uNumBulletsまでループを回すことで、不要な計算をスキップ
    for (int i = 0; i < MAX_BULLETS; i++) {
        if (i >= uNumBullets) break; // この行は必要ありません。ループ条件で制御されます。
        vec3 b = uBullets[i];
        vec2 bPos = vec2(b.x * aspect, b.y);
        // bulletsDist = min(bulletsDist, sdCircle(st - bPos, b.z));
		bulletsDist = min(bulletsDist, sdCircle(st - bPos, b.z));
		vec3 rainbow = vec3(0.5 + 0.5 *cos(10.0*bPos.y),  bPos.y, 0.5 + 100.0 * (st.x - bPos.x));
		color = blendSDFColor2(color, rainbow, vec3(1.0, 1.0, 1.0), bulletsDist, 0.01);
    }


    gl_FragColor = vec4(color, 1.0);
}`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
        return shader;
    }
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
const shaderProgram = gl.createProgram();
gl.attachShader(shaderProgram, vertexShader);
gl.attachShader(shaderProgram, fragmentShader);
gl.linkProgram(shaderProgram);
gl.useProgram(shaderProgram);

const programInfo = {
    program: shaderProgram,
    attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
    },
    uniformLocations: {
        resolution: gl.getUniformLocation(shaderProgram, 'uResolution'),
        time: gl.getUniformLocation(shaderProgram, 'uTime'),
        player: gl.getUniformLocation(shaderProgram, 'uPlayer'),
        enemy: gl.getUniformLocation(shaderProgram, 'uEnemy'),
        enemyBarrierState: gl.getUniformLocation(shaderProgram, 'uEnemyBarrierState'),
        enemyHpRatio: gl.getUniformLocation(shaderProgram, 'uEnemyHpRatio'),		
        playerHpRatio: gl.getUniformLocation(shaderProgram, 'uPlayerHpRatio'),
        bullets: gl.getUniformLocation(shaderProgram, 'uBullets'),
        numBullets: gl.getUniformLocation(shaderProgram, 'uNumBullets'),
    },
};

// 画面全体を覆う四角形の頂点バッファを作成
const quadBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
     1,  1,
]), gl.STATIC_DRAW);


// --- 音声 (変更なし) ---
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
function playReflectSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
}
function playBarrierSound() {
	const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(900, audioContext.currentTime);	
    oscillator.frequency.exponentialRampToValueAtTime(5000, audioContext.currentTime+0.2);
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.7);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.7);
}
function playHitSound() {
    const oscillator = audioContext.createOscillator();	
    const oscillator2 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
	oscillator2.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sine';	
    oscillator2.type = 'sine';
    oscillator.frequency.setValueAtTime(130, audioContext.currentTime);	
    oscillator2.frequency.setValueAtTime(255, audioContext.currentTime);	
    oscillator2.frequency.exponentialRampToValueAtTime(240, audioContext.currentTime+0.1);
    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.8);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.8);	
	oscillator2.start(audioContext.currentTime);
    oscillator2.stop(audioContext.currentTime + 0.8);	
}
function playHitSelfSound() {
    const oscillator = audioContext.createOscillator();	
    const oscillator2 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
	oscillator2.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sawtooth';	
    oscillator2.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(370, audioContext.currentTime);	
    oscillator.frequency.setValueAtTime(130, audioContext.currentTime+0.03);	
    oscillator2.frequency.setValueAtTime(365, audioContext.currentTime);	
    oscillator2.frequency.setValueAtTime(125, audioContext.currentTime+0.03);
    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
	oscillator2.start(audioContext.currentTime);
    oscillator2.stop(audioContext.currentTime + 0.2);
}

// --- ゲーム状態 (変更なし) ---
let player = { x: 0.5, y: 0.85, hp: 50, maxHp: 50, size: 0.03 };
let enemy = {
    x: 0.5, y: 0.15, size: 0.08, hp: 100, maxHp: 100,
    barrierState: "none",
    barrierTimer: 0,
    barrierPredictTime: 0,
    barrierActiveTime: 0,
	barrierProgress: 0,
};
let bullets = [];
let game = { stage: 0, isStageClear: false };

// --- ステージスクリプト処理 (変更なし) ---
let stageScript = [];
let scriptPointer = 0;
let waitTimer = 0;

const stageCommands = {
    'ENEMY_HP': args => {
        const hp = parseFloat(args[0]);
        enemy.maxHp = hp;
        enemy.hp = hp;
		executeNextCommand();
    },
    'WAIT': args => {
		console.log("waiting");
        waitTimer = parseFloat(args[0]);
    },
	'MOVE': args => {		
		console.log("moving");
        enemy.moveTimer = parseFloat(args[0]);
		enemy.moveTo = {x: parseFloat(args[1]), y: parseFloat(args[2])};
	    enemy.moveFrom = {x: enemy.x, y: enemy.y};
		enemy.moveProgress = 0;
	},
    'BARRIER': args => {
		console.log("preparing")
        enemy.barrierPredictTime = parseFloat(args[0]);
        enemy.barrierActiveTime = parseFloat(args[1]);
        enemy.barrierTimer = enemy.barrierPredictTime;
		enemy.barrierProgress = 0;
		enemy.barrierState = "preparing";
		enemy.barrierSound = false;
    }
};

const stages = [`ENEMY_HP 1000
WAIT 1000
BARRIER 1500 3000
WAIT 1500
BARRIER 1000 1500
MOVE 1000 0.2 0.2
WAIT 1000
BARRIER 500 2000
MOVE 1000 0.4 0.6
WAIT 2000
BARRIER 700 2000
MOVE 1200 0.5 0.2
`];
let executing = "";
async function loadStage(stageNum) {
	console.log(stageNum);
    try {
        const text = stages[stageNum];
        stageScript = text.split('\n').filter(line => line.trim() !== '');
        scriptPointer = 0;
        game.isStageClear = false;
        enemy.hp = enemy.maxHp; // Reset to max HP
        bullets = [];
		player.hp = player.maxHp;
        executeNextCommand();
    } catch (error) {
        console.error("Failed to load stage:", error);
    }
}

function executeNextCommand() {	
    if (scriptPointer >= stageScript.length) scriptPointer = 1;
	const ptr = scriptPointer;	
    scriptPointer++;
    const line = stageScript[ptr];
    const [command, ...args] = line.split(' ');
	executing = command;
    if (stageCommands[command]) {
        stageCommands[command](args);
    }
}

// --- ゲームロジック (変更なし) ---
function update(deltaTime) {
    if (game.isStageClear) return;

    if (executing === "WAIT") {
		if (waitTimer > 0) {
        waitTimer -= deltaTime;
		} else {			
        executeNextCommand();
		}
    }
	
    if (executing === "MOVE") {
        enemy.moveProgress += deltaTime;
		let t = Math.min(1.0, enemy.moveProgress / enemy.moveTimer);
		t = 1 - (1 - t) * (1 - t)
		enemy.x = (1 - t) * enemy.moveFrom.x + t * enemy.moveTo.x;
		enemy.y = (1 - t) * enemy.moveFrom.y + t * enemy.moveTo.y;
        if (enemy.moveProgress >= enemy.moveTimer) {
              executeNextCommand();
		}
    }
    if (executing === "BARRIER") {
        enemy.barrierProgress += deltaTime;
		if (enemy.barrierState === "preparing") {
		  if (enemy.barrierTimer - enemy.barrierProgress < 0.4 && !enemy.barrierSound) {			
			  playBarrierSound();
			  enemy.barrierSound = true;
		  }
          if (enemy.barrierProgress >= enemy.barrierTimer) {
			  console.log("activated");
			  enemy.barrierState = "active";
			  enemy.barrierTimer = enemy.barrierActiveTime;
			  enemy.barrierProgress = 0;
		  }
		}
		if (enemy.barrierState === "active") {
          if (enemy.barrierProgress >= enemy.barrierTimer) {			  
			  console.log("deactivated");
			  enemy.barrierState = "none";
			  enemy.barrierTimer = 0;
			  enemy.barrierProgress = 0;  
              executeNextCommand();
		  }
		}
    }

    bullets.forEach((b, i) => {
        b.y += b.vy;
        if (b.y < 0 || b.y > 1) {
            bullets.splice(i, 1);
        }
    });
    
    bullets.forEach(b => {
        const dx = (b.x - enemy.x) * aspect;
        const dy = b.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (enemy.barrierState === 'active' && dist < enemy.size + b.size + 0.04 && b.vy < 0) {
                b.vy *= -1;
                playReflectSound();
        } else if (enemy.barrierState !== 'active' && dist < enemy.size + b.size) {
                enemy.hp -= 10;				
                playHitSound();
                bullets.splice(bullets.indexOf(b), 1);
                if (enemy.hp <= 0) {
                    game.isStageClear = true;
                    
                    alert("たおした！！");
                    setTimeout(() => {
                        game.stage = (game.stage + 1) % stages.length; // 次のステージへ（ループする）
                        loadStage(game.stage);
                    }, 2000);
                }
        }
    });
	
	bullets.forEach(b => {
        const dx = (b.x - player.x) * aspect;
        const dy = b.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < player.size / 2 + b.size) {
                player.hp -= 10;				
                playHitSelfSound();
                bullets.splice(bullets.indexOf(b), 1);
                if (player.hp <= 0) {
                    game.isStageClear = false;
                    setTimeout(() => {						
                        alert("やられた！！");
                        game.stage = 0;
                        loadStage(game.stage);
                    }, 0);
                }
        }
    });
}

// --- 描画ロジック (SDFベースに刷新) ---
const MAX_BULLETS_IN_SHADER = 32;
const bulletDataForShader = new Float32Array(MAX_BULLETS_IN_SHADER * 3);

function draw() {
    gl.clearColor(0.05, 0.05, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(programInfo.program);

    // 頂点データを設定
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    
    // シェーダーにuniform変数を送る
    gl.uniform2f(programInfo.uniformLocations.resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(programInfo.uniformLocations.time, performance.now() / 1000);

    // ゲームオブジェクトの情報を送る
    gl.uniform3f(programInfo.uniformLocations.player, player.x, player.y, player.size);
    gl.uniform3f(programInfo.uniformLocations.enemy, enemy.x, enemy.y, enemy.size);
    
	if (enemy.barrierState === "none") {
      gl.uniform1f(programInfo.uniformLocations.enemyBarrierState, 0.0);
	} else if (enemy.barrierState === "preparing") {
      gl.uniform1f(programInfo.uniformLocations.enemyBarrierState, enemy.barrierProgress / enemy.barrierPredictTime);
	} else if (enemy.barrierState === "active") {
      gl.uniform1f(programInfo.uniformLocations.enemyBarrierState, 1.0);
	}
	
    gl.uniform1f(programInfo.uniformLocations.enemyHpRatio, Math.max(0, enemy.hp / enemy.maxHp));	
    gl.uniform1f(programInfo.uniformLocations.playerHpRatio, Math.max(0, player.hp / player.maxHp));
    
    // 弾の情報を配列として送る
    const numBulletsToSend = Math.min(bullets.length, MAX_BULLETS_IN_SHADER);
    for (let i = 0; i < numBulletsToSend; i++) {
        bulletDataForShader[i * 3 + 0] = bullets[i].x;
        bulletDataForShader[i * 3 + 1] = bullets[i].y;
        bulletDataForShader[i * 3 + 2] = bullets[i].size;
    }
    gl.uniform3fv(programInfo.uniformLocations.bullets, bulletDataForShader);
    gl.uniform1i(programInfo.uniformLocations.numBullets, numBulletsToSend);

    // 1回の描画コールで全てを描画
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// --- メインループ (変更なし) ---
let lastTime = 0;
function gameLoop(timestamp) {
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    update(deltaTime);
    draw();
    requestAnimationFrame(gameLoop);
}

// --- 入力 (変更なし) ---
canvas.addEventListener('mousemove', e => {
    player.x = e.clientX / canvas.width / resolution;
});

canvas.addEventListener('click', e => {
    bullets.push({ x: player.x + 0.02*Math.random(), y: player.y - 0.03, vy: -0.02, size: 0.015 });
});

let moving = false;
let timerID = null;
canvas.addEventListener('touchstart', e => {
    e.preventDefault();
	const dx = (player.x - e.touches[0].clientX / canvas.width / resolution) * aspect;
	const dy = player.y - e.touches[0].clientY / canvas.height / resolution;
	const r = 3 * player.size;
    if (dx * dx + dy * dy < r * r) {
	  timerID = setTimeout(args => {moving = true;}, 30);
	} else {
      bullets.push({ x: player.x + 0.02*Math.random(), y: player.y - 0.03, vy: -0.02, size: 0.015 });
	}
}, { passive: false });

canvas.addEventListener('touchend', e => {
  moving = false;
    if (timerID) {
	  clearTimeout(timerID);
	  timerID = null;
    }
});

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
	if (moving) {
      player.x = e.touches[0].clientX / canvas.width / resolution;
	}
}, { passive: false });

// --- 開始 ---
loadStage(game.stage);
requestAnimationFrame(gameLoop);