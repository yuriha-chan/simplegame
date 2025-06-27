const halfRight = Math.PI / 4;
/**
 * 2つのベクトルの内積を計算
 */

function dot(v1, v2) {
    return v1[0] * v2[0] + v1[1] * v2[1];
}

/**
 * 入射ベクトルと法線ベクトルから反射ベクトルを計算
 * @param {{x: number, y: number}} incidentVec - 入射ベクトル
 * @param {{x: number, y: number}} normalVec - 衝突面の法線ベクトル (正規化済みであること)
 * @returns {{x: number, y: number}} 反射ベクトル
 */
function reflect(incidentVec, normalVec) {
    const d = dot(incidentVec, normalVec);
    return [incidentVec[0] - 2 * d * normalVec[0], incidentVec[1] - 2 * d * normalVec[1]];
}

function refract(incidentVec, normalVec, n1, n2) {
    const n_ratio = n1 / n2;
    const cos_i = -dot(normalVec, incidentVec);
    const sin_t2 = n_ratio * n_ratio * (1.0 - cos_i * cos_i);

    // 全反射の条件チェック
    if (sin_t2 > 1.0) {
        return [reflect(incidentVec, normalVec), true];
    }

    const cos_t = Math.sqrt(1.0 - sin_t2);
    const term1_x = n_ratio * incidentVec[0];
    const term1_y = n_ratio * incidentVec[1];
    const term2_x = (n_ratio * cos_i - cos_t) * normalVec[0];
    const term2_y = (n_ratio * cos_i - cos_t) * normalVec[1];
    
    return [[term1_x + term2_x, term1_y + term2_y], false];
}

function getLineSegmentIntersection(rayStart, rayDir, p1, p2) {
    const v1 = [rayStart[0] - p1[0], rayStart[1] - p1[1]];
    const v2 = [p2[0] - p1[0], p2[1] - p1[1]]; // 線分ベクトル
    const v3 = [-rayDir[1], rayDir[0]];      // レイ方向と直交

    const dot_v2_v3 = dot(v2, v3);
    if (Math.abs(dot_v2_v3) < 1e-9) return null; // 平行

    const t1 = (v2[0] * v1[1] - v2[1] * v1[0]) / dot_v2_v3;
    const t2 = dot(v1, v3) / dot_v2_v3;

    if (t1 >= 0 && t2 >= 0 && t2 <= 1) {
        return [rayStart[0] + t1 * rayDir[0], rayStart[1] + t1 * rayDir[1]];
    }
    return null; // 交差しない
}

/**
 * 全てのセルの基底クラス（インターフェース定義）
 */
class BaseCell {
  interact () {
        return [[], false];
  }
  draw() {
  }
}

class EmptyCell extends BaseCell {
}

class BlockCell extends BaseCell {
  constructor(color = "black") {
    super();
    this.color = color;
  }
  interact(start, direction, normal, color) {
    if (color === this.color) {
      return [[], false];
    } else {
      return [[{start, direction}], true];
    }
  }
  draw(ctx, cellSize) {
      const fillColors = {black: "#000", yellow: "#FDA8", blue: "#99F8", red: "#F998"};  
      const strokeColors = {black: "#000", yellow: "#FD0", blue: "#00F", red: "#F00"};
      ctx.fillStyle = fillColors[this.color];
      ctx.strokeStyle = strokeColors[this.color];
      const lineWidth = 5
      ctx.lineWidth = lineWidth;
      ctx.fillRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize);      
      ctx.strokeRect(-cellSize / 2+lineWidth/2, -cellSize / 2+lineWidth/2, cellSize-lineWidth, cellSize-lineWidth);
  }
}

class TargetCell extends BlockCell {
    interact(start, direction) {
      this.receive = true;
      return [[{start, direction}], true];
    }
    draw(ctx, cellSize) {
        super.draw(ctx, cellSize);
        ctx.fillStyle = '#4682B4'; // SteelBlue
        ctx.beginPath();
        ctx.arc(0, 0, cellSize * 0.25, 0, Math.PI * 2);
        ctx.fill();
    }
}

class CrossCell extends BlockCell {
    constructor(rotation = 0, width = Math.PI/16) {
      super();
      this.rotation = rotation;
      this.width = width;
      this.rotatable = true;
    }
    interact(start, direction) {
        // 1. ブロードフェーズ: 光線が半径0.5の円を完全に外れるかチェック
        const perpendicular_dist = start[0] * direction[1] - start[1] * direction[0];
        if (Math.abs(perpendicular_dist) > 0.5) {
            return [[], false]; // 円に当たらないので、必ず通過
        }

        // 2. 座標系の変換: 判定のため、十字穴が軸に揃うように光線を逆回転
        const angle = this.rotation;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rs = [start[0] * cos - start[1] * (-sin), start[0] * (-sin) + start[1] * cos];
        const rd = [direction[0] * cos - direction[1] * (-sin), direction[0] * (-sin) + direction[1] * cos];

        // 3. 十字穴の通過判定
        const sin_w = Math.sin(this.width);
        const cos_w = Math.cos(this.width);
        const b = dot(rs, rd);
        const c = dot(rs, rs) - 0.25;
        
        const discriminant = b * b - c;

        if (discriminant >= 0) {
            const t1 = (-b - Math.sqrt(discriminant));            
            const t2 = (-b + Math.sqrt(discriminant));
            const h1 = [rs[0] + t1 * rd[0], rs[1] + t1 * rd[1]];            
            const h2 = [rs[0] + t2 * rd[0], rs[1] + t2 * rd[1]];
            if (-0.5*sin_w < h1[0] && h1[0] < 0.5*sin_w && -0.5*sin_w < h2[0] && h2[0] < 0.5*sin_w) {
                return [[], false]
            }
            if (-0.5*sin_w < h1[1] && h1[1] < 0.5*sin_w && -0.5*sin_w < h2[1] && h2[1] < 0.5*sin_w) {
                return [[], false]
            }
            let rh;
            // 内部に光が侵入
            if (-0.5*sin_w < h1[0] && h1[0] < 0.5*sin_w || -0.5*sin_w < h1[1] && h1[1] < 0.5*sin_w) {
              const valid_ts = [];
              if (Math.abs(rd[0]) > 1e-9) {
                const t_pos = (0.5*sin_w - rs[0]) / rd[0];
                const y_pos = rs[1] + t_pos * rd[1];
                if (t_pos > 1e-9 && Math.abs(y_pos) <= 0.5*cos_w && Math.abs(y_pos) >= 0.5*sin_w) { // y座標が十字の水平バー内かチェック
                  valid_ts.push(t_pos);
                }

                const t_neg = (-0.5*sin_w - rs[0]) / rd[0];
                const y_neg = rs[1] + t_neg * rd[1];
                if (t_neg > 1e-9 && Math.abs(y_neg) <= 0.5*cos_w && Math.abs(y_neg) >= 0.5*sin_w) {
                  valid_ts.push(t_neg);
                }
              }
              if (Math.abs(rd[1]) > 1e-9) {
                const t_pos = (0.5*sin_w - rs[1]) / rd[1];
                const x_pos = rs[0] + t_pos * rd[0];
                if (t_pos > 1e-9 && Math.abs(x_pos) <= 0.5*cos_w && Math.abs(x_pos) >= 0.5*sin_w) { // x座標が十字の垂直バー内かチェック
                  valid_ts.push(t_pos);
                }

                const t_neg = (-0.5*sin_w - rs[1]) / rd[1];
                const x_neg = rs[0] + t_neg * rd[0];
                if (t_neg > 1e-9 && Math.abs(x_neg) <= 0.5*cos_w && Math.abs(x_neg) >= 0.5*sin_w) {
                  valid_ts.push(t_neg);
                }
              }
              const t_hit = Math.min(...valid_ts);
              rh = [rs[0] + t_hit * rd[0], rs[1] + t_hit * rd[1]];              
            } else {
              rh = h1;
            }
            const hit = [rh[0] * cos - rh[1] * sin, rh[0] * sin + rh[1] * cos];
            return [[{ start: hit, direction: direction }], true];
        }

        // 理論上ここには到達しづらいが、安全のためブロックとして扱う
        return [[{ start, direction }], true];
    }
    
    draw(ctx, cellSize) {
        ctx.fillStyle = '#4682B4';
        ctx.save();
        ctx.rotate(this.rotation);
        const a = 0.5 * Math.sin(this.width) * cellSize;
        const b = 0.5 * Math.cos(this.width) * cellSize;
        const w = this.width;
        const v = Math.PI/2 - w;
        const r = cellSize * 0.5;
        ctx.beginPath();
        ctx.moveTo(a, a);
        ctx.lineTo(b, a);
        ctx.arc(0, 0, r, w, v);
        ctx.closePath();
        ctx.moveTo(-a, a);
        ctx.lineTo(-a, b);
        ctx.arc(0, 0, r, Math.PI/2 + w, Math.PI/2 + v);
        ctx.closePath();
        ctx.moveTo(-a, -a);
        ctx.lineTo(-b, -a);
        ctx.arc(0, 0, r, 2*Math.PI/2 + w, 2*Math.PI/2 + v);
        ctx.closePath();
        ctx.moveTo(a, -a);
        ctx.lineTo(a, -b);
        ctx.arc(0, 0, r, 3*Math.PI/2 + w, 3*Math.PI/2 + v);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

class GlassBlockCell extends BaseCell {
    /**
     * @param {object} refractiveIndices - e.g. { "red": 1.5, "yellow": 1., "blue": 1.7 }
     */
    constructor(refractiveIndices={ "red": 1.5, "yellow": 1.6, "blue": 2 }) {
        super();
        this.refractiveIndices = refractiveIndices;
    }

    interact(start, direction, norm, color) {
        const n1 = 1.0;
        const n2 = this.refractiveIndices[color];
        const [entryDirection, entryReflecting] = refract(direction, norm, n1, n2);            
        const path = [{ start: start, direction: entryDirection }];
        if (entryReflecting) {            
            return [path, false];
        }

        let pos = start, dir = entryDirection;
        
        for (let i = 0; i < 100; i++) {
            let t_x = Infinity, t_y = Infinity;
            if (dir[0] !== 0) {
                t_x = ((dir[0] > 0 ? 0.5 : -0.5) - pos[0]) / dir[0];
            }
            if (dir[1] !== 0) {
                t_y = ((dir[1] > 0 ? 0.5 : -0.5) - pos[1]) / dir[1];
            }
            const t_exit = Math.min(t_x, t_y);
            const exitPoint = [pos[0] + t_exit * dir[0], pos[1] + t_exit * dir[1]];
        
            // 出口の法線を決定
            const exitNormal = Math.abs(t_x - t_exit) < 1e-9 
                ? [-Math.sign(dir[0]), 0] 
                : [0, -Math.sign(dir[1])];

            const [exitDirection, exitReflecting] = refract(dir, exitNormal, n2, 1.0);
            path.push({ start: exitPoint, direction: exitDirection } );
            if (!exitReflecting) {
                break;
            }
            pos = exitPoint;
            dir = exitDirection;
        }
        return [path, false];
    }

    draw(ctx, cellSize) {
        ctx.fillStyle = 'rgba(200, 200, 255, 0.3)';
        ctx.strokeStyle = 'rgba(220, 220, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.fillRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize);
        ctx.strokeRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize);
    }
}

class FixedMirrorCell extends BaseCell {
  interact(start, direction, norm) {
    const dir = reflect(direction, norm);
    return [[{start, direction: dir}], false];
  }
  draw(ctx, cellSize) {
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 3;
        ctx.strokeRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize);
  }
}

class RotatableMirrorCell extends BaseCell {
  constructor(rotation = 0) {
    super();
    this.rotation = rotation;
    this.rotatable = true;
  }
  
  draw(ctx, cellSize) {
        const halfLen = cellSize / 2;
        ctx.save();
        ctx.rotate(this.rotation);
        ctx.strokeStyle = '#ADD8E6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-halfLen, 0);
        ctx.lineTo(halfLen, 0);
        ctx.stroke();
        ctx.restore();
  }

  interact(pos, direction) {
        const angle = this.rotation;
        const p1 = [-0.5 * Math.cos(angle), -0.5 * Math.sin(angle)];
        const p2 = [0.5 * Math.cos(angle), 0.5 * Math.sin(angle)];

        const intersection = getLineSegmentIntersection(pos, direction, p1, p2);

        if (intersection) {
            const mirrorVec = [p2[0] - p1[0], p2[1] - p1[1]];
            let normalVec = [-mirrorVec[1], mirrorVec[0]];
            const len = Math.sqrt(normalVec[0]**2 + normalVec[1]**2);
            normalVec = [normalVec[0] / len, normalVec[1] / len];
            if (dot(direction, normalVec) > 0) {
                normalVec = [normalVec[0] * -1, normalVec[1] * -1];
            }
            const newDirection = reflect(direction, normalVec);
            return [[{ start: intersection, direction: newDirection }], false];
        }
        return [[], false];
  }
}

/**
 * 光線を表す線分の束を返す
 * @param {BaseCell[][]} grid - セルオブジェクトの2次元配列
 * @param {LightBeam[]} beams - 入射光
 * @returns {LightBeam[]} 完了した光線の軌跡
 */
function trackRays(grid, beams) {
  const gridWidth = grid[0].length;
  const gridHeight = grid.length;
  const MAX_INTERACTIONS = 100;
  const beamQueue = [...beams];

  for (let i = 0; i < beamQueue.length; i++) {
    const beam = beamQueue[i];
    let interactionCount = 0;
    let [sx, sy] = beam.start;
    let [dx, dy] = beam.direction;
    let [cx, cy] = beam.cell;
    let [x, y] = [sx, sy];
    beam.path = [[sx, sy]];
    let normal = [0, 1];
    while(interactionCount < MAX_INTERACTIONS) {
        const cell = grid[cy][cx];
        const [segments, terminate] = cell.interact([x - cx - 0.5, y - cy - 0.5], [dx, dy], normal, beam.color);
        for (s of segments) {
            const [sx0, sy0] = s.start;
            sx = sx0 + cx + 0.5;
            sy = sy0 + cy + 0.5;
            const pos = [sx, sy];
            beam.path.push(pos);            
            [dx, dy] = s.direction;
            interactionCount++;
        }
        if (terminate) {
            break;
        }
        let t_vertical = Infinity, t_horizontal = Infinity;
        
        if (dx !== 0) { t_vertical = ((dx > 0 ? cx + 1 : cx) - sx) / dx; }
        if (dy !== 0) { t_horizontal = ((dy > 0 ? cy + 1 : cy) - sy) / dy; }
        
        const isVerticalHit = t_vertical < t_horizontal;
        const t = isVerticalHit ? t_vertical : t_horizontal;

        if (isVerticalHit) {
            cx += Math.sign(dx);
        } else {
            cy += Math.sign(dy);
        }
        
        x = sx + dx * t;
        y = sy + dy * t;
        normal = isVerticalHit ? [-Math.sign(dx), 0] : [0, -Math.sign(dy)];

        if (cx < 0 || cx >= gridWidth || cy < 0 || cy >= gridHeight) {
            beam.path.push([x, y])
            break;
        }
        
    }
  }
  return beamQueue;
}

class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    }

    render(grid, beams, gauge, cleared) {
            this.grid = grid;
        this.beams = beams;        
        this.gridWidth = grid[0].length;
        this.gridHeight = grid.length;
        this.cellSize = Math.min(this.canvas.width / this.gridWidth, (innerHeight - 50)/ this.gridHeight);
        this.canvas.height = this.gridHeight * this.cellSize + 50;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this._drawGrid();
        this._drawCells();
        this._drawBeams();
        this._drawUI(gauge, cleared);
    }

    _drawGrid() {
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        for (let i = 1; i < this.gridWidth; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(i * this.cellSize, 0);
            this.ctx.lineTo(i * this.cellSize, this.canvas.height);
            this.ctx.stroke();
        }
        for (let i = 1; i < this.gridHeight; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, i * this.cellSize);
            this.ctx.lineTo(this.canvas.width, i * this.cellSize);
            this.ctx.stroke();
        }
    }

    _drawCells() {
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                this.ctx.save();
                // 各セルの中心に原点を移動
                this.ctx.translate((x + 0.5) * this.cellSize, (y + 0.5) * this.cellSize);
                // セルオブジェクトのdrawメソッドを呼び出す
                this.grid[y][x].draw(this.ctx, this.cellSize);
                this.ctx.restore();
            }
        }
    }

    _drawBeams() {
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'bevel';
        const colors = {"yellow": '#FFD700', "red": "#FF0000", "blue": "#0033FF"}
        for (const beam of this.beams) {
            if (beam.path.length < 2) {
                continue;
            }
            this.ctx.beginPath();
            const [x, y] = beam.path[0];
            this.ctx.moveTo(x * this.cellSize, y * this.cellSize);

            for (let i = 1; i < beam.path.length; i++) {
                const [x, y] = beam.path[i];
                this.ctx.lineTo(x * this.cellSize, y * this.cellSize);
            }

            // 光っているようなエフェクト
            this.ctx.strokeStyle = '#FFF';
            this.ctx.lineWidth = 3;
            this.ctx.shadowColor = '#FFF';
            this.ctx.shadowBlur = 10;
            this.ctx.stroke();

            // 中心線
            beam.color = beam.color ? beam.color : "yellow";
            this.ctx.strokeStyle = colors[beam.color];
            this.ctx.lineWidth = 1;
            this.ctx.shadowBlur = 0; // 中心の線には影をつけない
            this.ctx.stroke();
            
            for (let i = 1; i < beam.path.length; i++) {
                const [x, y] = beam.path[i];
                this.ctx.beginPath();
                this.ctx.arc(x * this.cellSize, y * this.cellSize, 4, 0, Math.PI * 2);
                this.ctx.fillStyle = '#FFFE';
                this.ctx.shadowColor = '#FFFA';
                this.ctx.shadowBlur = 20;
                this.ctx.fill();        
                this.ctx.stroke();
            }
        }
        // コンテキストの状態をリセット
        this.ctx.shadowBlur = 0;        
        this.ctx.lineJoin = 'miter';
    }
    _drawUI(gaugeValue, isLevelClear) {
        // ゲージの描画
        const gaugeWidth = this.canvas.width * 0.8;
        const gaugeHeight = 20;
        const x = (this.canvas.width - gaugeWidth) / 2;
        const y = this.canvas.height - gaugeHeight - 10;
        
        this.ctx.fillStyle = '#444';
        this.ctx.fillRect(x, y, gaugeWidth, gaugeHeight);
        
        const fillWidth = gaugeWidth * (gaugeValue);
        this.ctx.fillStyle = '#4CAF50';
        this.ctx.fillRect(x, y, fillWidth, gaugeHeight);
        
        this.ctx.strokeStyle = '#FFF';
        this.ctx.strokeRect(x, y, gaugeWidth, gaugeHeight);

        // ステージクリア表示
        if (isLevelClear) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 50px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('ステージ クリア！', this.canvas.width / 2, this.canvas.height / 2);
        }
    }
}

class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new Renderer(canvas);
        
        this.levels = levels;
        this.currentLevelIndex = 0;

        // ゲーム状態
        this.grid = [];
        this.initBeams = [];
        this.targetCells = [];
        this.isGameRunning = false;
        this.isLevelClear = false;
        
        // ゲージ関連
        this.gaugeValue = 0;
        this.GAUGE_FILL_RATE = 0.3; // 1秒あたりの増加量
        this.GAUGE_DECAY_RATE = 4; // 1秒あたりの減少量
        this.lastTimestamp = 0;

        // ドラッグ状態
        this.isDragging = false;
        this.draggedMirror = null;
        this.draggedMirrorCellPos = { x: 0, y: 0 };
        
        this._addEventListeners();
    }

    async start() {
        await this.loadLevel(this.levels[this.currentLevelIndex]);
    }

    async loadLevel(level) {
        this.isGameRunning = false;
        this.isLevelClear = false;
        this.gaugeValue = 0;

        try {
            // const response = await fetch(levelPath);
            // if (!response.ok) throw new Error(`Failed to load ${levelPath}`);
            // const levelData = await response.json();
                  const levelData = level;
            
            this.initBeams = levelData.beams;
            this.grid = this.parseGrid(levelData.grid);
            this.targetCells = this.findTargetCells(this.grid);
						const gridWidth = this.grid[0].length, gridHeight = this.grid.length;
            this.cellSize = Math.min(this.canvas.width / gridWidth, (innerHeight - 50) / gridHeight);

            this.isGameRunning = true;
            this.dirty = true;
            requestAnimationFrame((timestamp) => {
                this.lastTimestamp = timestamp;
                this.gameLoop(timestamp);
            });
        } catch (error) {
            console.error("Error loading level:", error);
            // エラー表示など
        }
    }

    parseGrid(gridData) {
        return gridData.map(row => row.map(cellData => {
            switch (cellData.type) {
                case 'Empty': return new EmptyCell();
                case 'Block': return new BlockCell(cellData.color || "black");
                case 'GlassBlock': return new GlassBlockCell();
                case 'Target': return new TargetCell();
                case 'FixedMirror': return new FixedMirrorCell();
                case 'RotatableMirror': return new RotatableMirrorCell(cellData.rotation ? cellData.rotation/180*Math.PI : 1/4*Math.PI);
                case 'Cross': return new CrossCell(cellData.rotation ? cellData.rotation/180*Math.PI : 0);
                default: return new EmptyCell();
            }
        }));
    }

    findTargetCells(grid) {
        const targets = [];
        grid.forEach((row, y) => {
            row.forEach((cell, x) => {
                if (cell instanceof TargetCell) {
                    targets.push(cell);
                }
            });
        });
        return targets;
    }

    gameLoop(timestamp) {
        if (!this.isGameRunning) return;

        const deltaTime = (timestamp - this.lastTimestamp);
        this.lastTimestamp = timestamp;

        // ゴール判定
        const allTargetsHit = this.checkWinCondition();

        // ゲージの更新
        if (allTargetsHit) {
            this.gaugeValue += this.GAUGE_FILL_RATE * (deltaTime / 1000);
            this.gaugeValue = Math.min(this.gaugeValue, 1);
        } else {
            this.gaugeValue -= this.GAUGE_DECAY_RATE * (deltaTime / 1000);
            this.gaugeValue = Math.max(0, this.gaugeValue);
        }
        
        this.updateAndRender();

        // クリア判定
        if (this.gaugeValue >= 1 && !this.isLevelClear) {
            this.handleLevelClear();
        }
        
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    checkWinCondition() {
        if (this.targetCells.length === 0) return false;        
        const hitTargets = new Set(this.targetCells.filter(target => target.receive));

        return this.targetCells.every(target => hitTargets.has(target));
    }

    handleLevelClear() {
        this.isLevelClear = true;
        this.isGameRunning = false; // 一時的にループの更新を止める
        this.updateAndRender(); // クリア表示を描画

        setTimeout(() => {
            this.currentLevelIndex++;
            if (this.currentLevelIndex < this.levels.length) {
                this.start();
            } else {
                alert("すべてクリア！");
            }
        }, 2500); // 3秒後に次のステージへ
    }

    updateAndRender() {
        if (this.dirty) {
          const beamsToTrack = JSON.parse(JSON.stringify(this.initBeams));
          this.targetCells.forEach(target => { target.receive = false });
          this.result = trackRays(this.grid, beamsToTrack);
        }
        this.renderer.render(this.grid, this.result, this.gaugeValue, this.isLevelClear);
        this.dirty = false;
    }
    
        _addEventListeners() {
        // --- マウスイベント ---
        this.canvas.addEventListener('mousedown', (e) => {
            if (!this.isGameRunning) return;
            const rect = this.canvas.getBoundingClientRect();
            // 共通の開始ロジックを呼び出し
            this.handleDragStart(e.clientX - rect.left, e.clientY - rect.top);
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging || !this.isGameRunning) return;
            const rect = this.canvas.getBoundingClientRect();
            // 共通の移動ロジックを呼び出し
            this.handleDragMove(e.clientX - rect.left, e.clientY - rect.top);
        });

        window.addEventListener('mouseup', () => {
            // 共通の終了ロジックを呼び出し
            this.handleDragEnd();
        });

        // --- タッチイベント ---
        this.canvas.addEventListener('touchstart', (e) => {
            // ゲーム操作中はページのスクロールなどを禁止する
            e.preventDefault();
            if (!this.isGameRunning || e.touches.length === 0) return;
            
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches[0];
            // 共通の開始ロジックを呼び出し
            this.handleDragStart(touch.clientX - rect.left, touch.clientY - rect.top);
        }, { passive: false }); // preventDefaultを有効にするためのオプション

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!this.isDragging || !this.isGameRunning || e.touches.length === 0) return;

            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches[0];
            // 共通の移動ロジックを呼び出し
            this.handleDragMove(touch.clientX - rect.left, touch.clientY - rect.top);
        }, { passive: false });

        // touchendとtouchcancelは同様にドラッグ終了として扱う
        this.canvas.addEventListener('touchend', () => this.handleDragEnd());
        this.canvas.addEventListener('touchcancel', () => this.handleDragEnd());
    }

    /**
     * ドラッグ開始処理（マウス・タッチ共通）
     * @param {number} x - canvas上のx座標
     * @param {number} y - canvas上のy座標
     */
    handleDragStart(x, y) {
        const gridX = Math.floor(x / this.cellSize);
        const gridY = Math.floor(y / this.cellSize);

        if (this.grid[gridY]?.[gridX].rotatable) {
            this.isDragging = true;
            this.draggedMirror = this.grid[gridY][gridX];
            this.draggedMirrorCellPos = { x: gridX, y: gridY };
            // ドラッグ開始直後にも角度を更新し、即座に反応するようにする
            this.handleDragMove(x, y);
        }
    }

    /**
     * ドラッグ中の移動処理（マウス・タッチ共通）
     * @param {number} x - canvas上のx座標
     * @param {number} y - canvas上のy座標
     */
    handleDragMove(x, y) {
        if (!this.draggedMirror) return;

        const mirrorCenterX = (this.draggedMirrorCellPos.x + 0.5) * this.cellSize;
        const mirrorCenterY = (this.draggedMirrorCellPos.y + 0.5) * this.cellSize;
        const dx = x - mirrorCenterX;
        const dy = y - mirrorCenterY;
        const angle = Math.atan2(dy, dx);
        
        this.draggedMirror.rotation = angle;
        
        // ドラッグ中はリアルタイムでシミュレーションと描画を更新
        this.dirty = true;
        this.updateAndRender();
    }

    /**
     * ドラッグ終了処理（マウス・タッチ共通）
     */
    handleDragEnd() {
        if (this.isDragging) {
            this.isDragging = false;
            this.draggedMirror = null;
        }
    }
}

const levels = [
{
  "beams": [
    { "start": [0.5, -0.1], "direction": [0, 1], "cell": [0, 0] }
  ],
  "grid": [
    [ { "type": "Empty" }, { "type": "FixedMirror" }, { "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" } ],
    [ { "type": "RotatableMirror", "rotation": 45 }, { "type": "FixedMirror" }, { "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Target" } ],
  ]
},
{
  "beams": [
    { "start": [0.5, -0.1], "direction": [0, 1], "cell": [0, 0] }
  ],
  "grid": [
    [ { "type": "Empty" }, { "type": "FixedMirror" }, { "type": "RotatableMirror", "rotation": 30 }, { "type": "FixedMirror" }, { "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Target" } ],
    [ { "type": "RotatableMirror", "rotation": 45 }, { "type": "FixedMirror" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" } ],
  ]
},
{
  "beams": [
    { "start": [0.5, -0.1], "direction": [0, 1], "cell": [0, 0] }
  ],
  "grid": [  
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Target" }, { "type": "Empty" }, { "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "Block" }, { "type": "Empty" }, { "type": "FixedMirror" }, { "type": "Empty" } ],
    [ { "type": "RotatableMirror", "rotation": 30 }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "RotatableMirror", "rotation": 30 } ],
    [ { "type": "Empty" }, { "type": "Block" }, { "type": "Empty" }, { "type": "Block" }, { "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "RotatableMirror", "rotation": 30 }, { "type": "Empty" }, { "type": "RotatableMirror", "rotation": 30 } ],
  ]
},
{
  "beams": [
    { "start": [2.5, -0.1], "direction": [0, 1], "cell": [2, 0], "color": "yellow" },
    { "start": [2.5, 5.1], "direction": [0, -1], "cell": [2, 4], "color": "red" },
  ],
  "grid": [  
    [ { "type": "Target" }, { "type": "Block" }, { "type": "Empty" }, { "type": "FixedMirror" }, { "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "Block" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "RotatableMirror", "rotation": 30 }, { "type": "Empty" }, { "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Block" }, { "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "RotatableMirror", "rotation": -45 }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Target" } ],
  ]
},

{
  "beams": [
    { "start": [-0.1, 0.5], "direction": [1, 0], "cell": [0, 0], "color": "yellow" },
    { "start": [7.1, 0.5], "direction": [-1, 0], "cell": [6, 0], "color": "red" },
  ],
  "grid": [  
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "RotatableMirror", "rotation": 30 }, { "type": "FixedMirror" }, { "type": "RotatableMirror", "rotation": 30 }, { "type": "Empty" }, { "type": "Empty" } ],
    [ { "type": "Block" }, { "type": "Block" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" },{ "type": "Block" }, { "type": "Block" }, ],
    [ { "type": "Target" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "RotatableMirror", "rotation": 0.1 }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Target" }, ],
    [ { "type": "Block" }, { "type": "Block" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" },{ "type": "Block" }, { "type": "Block" } ],
    [ { "type": "Empty" }, { "type": "Empty" },{ "type": "Empty" }, { "type": "FixedMirror" }, { "type": "Empty" },{ "type": "Empty" }, { "type": "Empty" } ],
  ]
},
{
  "beams": [
    { "start": [-0.1, 0.5], "direction": [1, 0], "cell": [0, 0], "color": "yellow" },
    { "start": [7.1, 0.5], "direction": [-1, 0], "cell": [6, 0], "color": "red" },
  ],
  "grid": [  
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "RotatableMirror", "rotation": 30 }, { "type": "FixedMirror" }, { "type": "RotatableMirror", "rotation": 30 }, { "type": "Empty" }, { "type": "Empty" } ],
    [ { "type": "Block" }, { "type": "Block" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" },{ "type": "Block" }, { "type": "Block" }, ],
    [ { "type": "Target" }, { "type": "FixedMirror" }, { "type": "Empty" }, { "type": "RotatableMirror", "rotation": 30 }, { "type": "Empty" }, { "type": "FixedMirror" }, { "type": "Block" }, ],
    [ { "type": "Empty" }, { "type": "Block" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" },{ "type": "Block" }, { "type": "Target" } ],
    [ { "type": "RotatableMirror", "rotation": 30 }, { "type": "Empty" },{ "type": "Empty" }, { "type": "FixedMirror" }, { "type": "Empty" },{ "type": "RotatableMirror", "rotation": 0.1 }, { "type": "Empty" } ],
  ]
},
{
  "beams": [
    { "start": [0.5, -0.1], "direction": [0, 1], "cell": [0, 0], "color": "yellow" },
    { "start": [1.5, -0.1], "direction": [0, 1], "cell": [1, 0], "color": "red" },
  ],
  "grid": [  
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Block" }, { "type": "Empty" }, { "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Block" },{ "type": "Empty" }, { "type": "Empty" }, ],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Block" }, { "type": "FixedMirror" }, { "type": "Block" }, ],
    [ { "type": "Empty" }, { "type": "RotatableMirror", "rotation": 45 }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Block", "color": "yellow"},{ "type": "Empty" }, { "type": "Target" } ],
    [ { "type": "RotatableMirror", "rotation": 45 }, { "type": "Empty" },{ "type": "Empty" }, { "type": "Empty" }, { "type": "Block", "color": "red"},{ "type": "Empty" }, { "type": "Target" } ],
  ]
},
{
  "beams": [
    { "start": [-0.1, 1.5], "direction": [1, 0], "cell": [0, 1], "color": "yellow" },
    { "start": [-0.1, 2.5], "direction": [1, 0], "cell": [0, 2], "color": "red" },
  ],
  "grid": [  
    [ { "type": "Target" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Block" }, { "type": "Empty" }, { "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Block", "color": "yellow" },{ "type": "RotatableMirror", "rotation": 45 }, { "type": "Empty" }, ],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Block", "color": "red" }, { "type": "Empty" }, { "type": "RotatableMirror", "rotation": 45 }, ],
    [ { "type": "Target" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Block", "color": "yellow" },{ "type": "Empty" }, { "type": "RotatableMirror", "rotation": -45 } ],
    [ { "type": "Empty" }, { "type": "Empty" },{ "type": "Empty" }, { "type": "Empty" }, { "type": "Block", "color": "red"},{ "type": "RotatableMirror", "rotation": -45 }, { "type": "Empty" } ],
  ]
},
{
  "beams": [
    { "start": [0.5, -0.1], "direction": [0, 1], "cell": [0, 0], "color": "yellow" },
    { "start": [1.5, -0.1], "direction": [0, 1], "cell": [1, 0], "color": "red" },
  ],
  "grid": [  
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Block" }, { "type": "Target" }, { "type": "Block" }, { "type": "Empty" }, { "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "FixedMirror" }, { "type": "Empty" }, { "type": "FixedMirror" },{ "type": "Empty" }, { "type": "Empty" }, ],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Block" }, { "type": "FixedMirror" }, { "type": "Empty" }, ],
    [ { "type": "Empty" }, { "type": "RotatableMirror", "rotation": 45 }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Block", "color": "yellow"},{ "type": "Empty" }, { "type": "FixedMirror" } ],
    [ { "type": "RotatableMirror", "rotation": 45 }, { "type": "Empty" },{ "type": "Empty" }, { "type": "Empty" }, { "type": "Block", "color": "red"},{ "type": "Target" }, { "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "FixedMirror" },{ "type": "Empty" }, { "type": "Empty" }, ],
  ]
},
{
  "beams": [
  
    { "start": [0.3, -0.1], "direction": [0, 1], "cell": [0, 0], "color": "blue" },
    { "start": [0.5, -0.1], "direction": [0, 1], "cell": [0, 0], "color": "yellow" },
    { "start": [0.7, -0.1], "direction": [0, 1], "cell": [0, 0], "color": "red" },
  ],
  "grid": [  
    [ { "type": "Empty" }, { "type": "Target" }, { "type": "Block" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "FixedMirror" }, { "type": "Empty" }, { "type": "Empty" },{ "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "RotatableMirror" }, { "type": "RotatableMirror" }, { "type": "RotatableMirror" }, { "type": "Block", "color": "yellow"},{ "type": "Empty" }],
    [ { "type": "RotatableMirror", "rotation": 45 }, { "type": "Empty" },{ "type": "Empty" }, { "type": "Empty" }, { "type": "Block", "color": "red"},{ "type": "Target" } ],
    [ { "type": "Empty" }, { "type": "RotatableMirror", "rotation": 45 }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Block", "color": "blue" },{ "type": "Target" } ],
  ]
},
{
  "beams": [
  
    { "start": [0.3, -0.1], "direction": [0, 1], "cell": [0, 0], "color": "blue" },
    { "start": [0.5, -0.1], "direction": [0, 1], "cell": [0, 0], "color": "yellow" },
    { "start": [0.7, -0.1], "direction": [0, 1], "cell": [0, 0], "color": "red" },
  ],
  "grid": [  
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Target" }, { "type": "RotatableMirror" }, { "type": "RotatableMirror" }, { "type": "Target" }],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" },{ "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "Block", "color": "red"}, { "type": "GlassBlock" }, { "type": "Empty" }, { "type": "Empty"},{ "type": "Empty" }],
    [ { "type": "Empty" }, { "type": "GlassBlock" },{ "type": "Empty" }, { "type": "Empty" }, { "type": "FixedMirror"},{ "type": "Empty" } ],
    [ { "type": "RotatableMirror" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Target" }, { "type": "Empty" },{ "type": "Empty" } ],
  ]
},
{
  "beams": [
    { "start": [0.5, -0.1], "direction": [0, 1], "cell": [0, 0], "color": "yellow" },
    { "start": [1.5, 5.1], "direction": [0, -1], "cell": [1, 4], "color": "red" },
  ],
  "grid": [  
    [ { "type": "Empty" }, { "type": "RotatableMirror" }, { "type": "Empty" }, { "type": "Block" }, { "type": "Target" }, { "type": "Target" }],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "FixedMirror" }, { "type": "RotatableMirror" },{ "type": "Empty" } ],
    [ { "type": "Empty" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Cross" }, { "type": "Empty"},{ "type": "Empty" }],
    [ { "type": "Empty" }, { "type": "Empty" },{ "type": "Empty" }, { "type": "FixedMirror" }, { "type": "Empty"},{ "type": "Empty" } ],
    [ { "type": "RotatableMirror" }, { "type": "Empty" }, { "type": "Empty" }, { "type": "Block" }, { "type": "Empty" },{ "type": "Empty" } ],
  ]
},
];

// --- メインの実行ブロック ---
window.onload = () => {
    const canvas = document.getElementById('gameCanvas');
    const game = new Game(canvas);
    game.start();
};
