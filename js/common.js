// common.js - Shared utilities and parking game engine

// ---------- Math & Geometry ----------
function linesIntersect(a, b, c, d, p, q, r, s) {
    const det = (c - a) * (s - q) - (r - p) * (d - b);
    if (det === 0) return false;
    const lambda = ((s - q) * (r - a) + (p - r) * (s - b)) / det;
    const gamma = ((b - d) * (r - a) + (c - a) * (s - b)) / det;
    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
}

function drawClippedGuideLine(ctx, px, py, dx, dy, minX, minY, maxX, maxY) {
    if (!ctx) return;
    const EPS = 1e-6;
    const hits = [];
    if (Math.abs(dx) > EPS) {
        const tLeft = (minX - px) / dx;
        const yLeft = py + tLeft * dy;
        if (yLeft >= minY - EPS && yLeft <= maxY + EPS) hits.push({ x: minX, y: yLeft, t: tLeft });
        const tRight = (maxX - px) / dx;
        const yRight = py + tRight * dy;
        if (yRight >= minY - EPS && yRight <= maxY + EPS) hits.push({ x: maxX, y: yRight, t: tRight });
    }
    if (Math.abs(dy) > EPS) {
        const tTop = (minY - py) / dy;
        const xTop = px + tTop * dx;
        if (xTop >= minX - EPS && xTop <= maxX + EPS) hits.push({ x: xTop, y: minY, t: tTop });
        const tBottom = (maxY - py) / dy;
        const xBottom = px + tBottom * dx;
        if (xBottom >= minX - EPS && xBottom <= maxX + EPS) hits.push({ x: xBottom, y: maxY, t: tBottom });
    }
    if (hits.length < 2) return;
    hits.sort((a, b) => a.t - b.t);
    const p1 = hits[0];
    const p2 = hits[hits.length - 1];
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
}

function clamp01(val) {
    return Math.min(1, Math.max(0, Number(val)));
}

function getCarEdges(corners) {
    return [[corners[0], corners[1]], [corners[1], corners[2]], [corners[2], corners[3]], [corners[3], corners[0]]];
}

function hasAnyEdgeIntersection(edges, lines, intersectFn = linesIntersect) {
    for (const edge of edges) {
        for (const line of lines) {
            if (intersectFn(edge[0].x, edge[0].y, edge[1].x, edge[1].y, line.x1, line.y1, line.x2, line.y2)) {
                return true;
            }
        }
    }
    return false;
}

function showWarning(element, text, color) {
    if (!element) return;
    element.innerText = text;
    element.style.backgroundColor = color;
    element.style.display = 'block';
}

function prepareImageCrop(image, cropState) {
    if (!image || !cropState) return false;
    if (!image.complete || image.naturalWidth <= 0) return false;
    if (cropState.ready) return true;
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    const offCanvas = (typeof OffscreenCanvas !== 'undefined')
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });
    if (!offCanvas) {
        cropState.sx = 0; cropState.sy = 0; cropState.sw = w; cropState.sh = h; cropState.ready = true;
        return true;
    }
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) {
        cropState.sx = 0; cropState.sy = 0; cropState.sw = w; cropState.sh = h; cropState.ready = true;
        return true;
    }
    offCtx.drawImage(image, 0, 0);
    const imgData = offCtx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (imgData[(y * w + x) * 4 + 3] > 12) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }
    if (maxX >= minX && maxY >= minY) {
        cropState.sx = minX; cropState.sy = minY;
        cropState.sw = maxX - minX + 1; cropState.sh = maxY - minY + 1;
    } else {
        cropState.sx = 0; cropState.sy = 0; cropState.sw = w; cropState.sh = h;
    }
    cropState.ready = true;
    return true;
}

// ---------- Constants ----------
const PARKING_BASE = {
    SCALE: 45,
    COLLISION_FRONT_SCALE: 0.80,
    COLLISION_REAR_SCALE: 0.72,
    COLLISION_SIDE_SCALE: 0.72,
    STEERING_LOCAL_RATIO: { x: 0.50, y: -0.16 },
    DRIVER_SEAT_LOCAL_RATIO: { x: 0.30, y: -0.20 },
    STEER_ENTER_STRAIGHT_THRESHOLD: 0.015,
    STEER_EXIT_STRAIGHT_THRESHOLD: 0.03,
    GUIDE_DOT_RADIUS: 10,
    GUIDE_DOT_BLINK_INTERVAL_MS: 480,
    GUIDE_DOT_COLOR_A: '#3ef838',
    GUIDE_DOT_COLOR_B: '#fb923c',
    GUIDE_HANDLE_SIZE_PX: 20,
    HUD_DASH_OPACITY_OVERLAP: 0.18,
    HUD_RESTORE_DELAY_MS: 250
};

// ---------- Factory: create a parking game instance ----------
function createParkingGame(spec) {
    const {
        mode,
        sharedDom,
        options = {},
        buildEnvironment,
        getYellowLines,
        getBorderLines,
        getGuideDots,
        checkParkingSuccess,
        checkExerciseCompleted,
        initialCarState
    } = spec;

    const SCALE = PARKING_BASE.SCALE;
    const COLLISION_FRONT_SCALE = PARKING_BASE.COLLISION_FRONT_SCALE;
    const COLLISION_REAR_SCALE = PARKING_BASE.COLLISION_REAR_SCALE;
    const COLLISION_SIDE_SCALE = PARKING_BASE.COLLISION_SIDE_SCALE;
    const STEERING_LOCAL_RATIO = PARKING_BASE.STEERING_LOCAL_RATIO;
    const DRIVER_SEAT_LOCAL_RATIO = PARKING_BASE.DRIVER_SEAT_LOCAL_RATIO;
    const STEER_ENTER_STRAIGHT_THRESHOLD = PARKING_BASE.STEER_ENTER_STRAIGHT_THRESHOLD;
    const STEER_EXIT_STRAIGHT_THRESHOLD = PARKING_BASE.STEER_EXIT_STRAIGHT_THRESHOLD;
    const GUIDE_DOT_RADIUS = PARKING_BASE.GUIDE_DOT_RADIUS;
    const GUIDE_DOT_BLINK_INTERVAL_MS = PARKING_BASE.GUIDE_DOT_BLINK_INTERVAL_MS;
    const GUIDE_DOT_COLOR_A = PARKING_BASE.GUIDE_DOT_COLOR_A;
    const GUIDE_DOT_COLOR_B = PARKING_BASE.GUIDE_DOT_COLOR_B;
    const GUIDE_HANDLE_SIZE_PX = PARKING_BASE.GUIDE_HANDLE_SIZE_PX;

    const canvas = sharedDom.canvas;
    const ctx = canvas.getContext('2d');
    const warningDiv = sharedDom.warningMsg;
    const carImage = sharedDom.carImg;

    let showDimensions = options.showDimensions !== undefined ? options.showDimensions : true;
    let wheelOpacity = options.wheelOpacity !== undefined ? Number(options.wheelOpacity) : 0.15;
    let dashOpacity = options.dashOpacity !== undefined ? Number(options.dashOpacity) : 0.92;
    let controlMode = options.controlMode || 'kb';

    let ENV = {};
    let yellowLines = [];
    let borderLines = [];
    let guideDots = [];
    let mapOffsetX = 0, mapOffsetY = 0;
    let CAR_A = parseFloat(sharedDom.cfgCarA.value);
    let CAR_B = parseFloat(sharedDom.cfgCarB.value);

    const GAME_CONFIG = {
        moveSpeed: parseFloat(sharedDom.cfgMoveSpeed.value),
        steerSpeed: parseFloat(sharedDom.cfgSteerSpeed.value),
        maxSteerTurns: 2.5,
        maxSteerAngleRad: 40 * Math.PI / 180,
    };

    const car = {
        x: initialCarState.x,
        y: initialCarState.y,
        angle: initialCarState.angle,
        steeringTurns: 0,
        gear: 1,
        isMoving: false
    };

    const keys = { A: false, D: false };
    let isSteerInStraightZone = true;
    let hasParkingSuccess = false;
    let hasExerciseCompleted = false;
    let lastTime = 0;
    let animationId = null;
    let hudRestoreTimer = null;

    const carImageCrop = { sx: 0, sy: 0, sw: 0, sh: 0, ready: false };

    // ---------- Helper functions ----------
    function updateGearUI() {
        const gearText = car.gear === 1 ? "TIẾN" : "LÙI";
        if (sharedDom.hudGear) sharedDom.hudGear.innerText = gearText;
        if (sharedDom.gearDisplay) sharedDom.gearDisplay.innerText = gearText;
    }

    function showWarningMsg(text, color) {
        showWarning(warningDiv, text, color);
    }

    function getCarCorners(cx = car.x, cy = car.y, ca = car.angle) {
        const cos = Math.cos(ca), sin = Math.sin(ca);
        const front = ENV.carW * 0.78 * COLLISION_FRONT_SCALE;
        const rear = ENV.carW * 0.22 * COLLISION_REAR_SCALE;
        const halfSide = (ENV.carH / 2) * COLLISION_SIDE_SCALE;
        return [
            { x: cx + front*cos - halfSide*sin, y: cy + front*sin + halfSide*cos },
            { x: cx + front*cos + halfSide*sin, y: cy + front*sin - halfSide*cos },
            { x: cx - rear*cos + halfSide*sin, y: cy - rear*sin - halfSide*cos },
            { x: cx - rear*cos - halfSide*sin, y: cy - rear*sin + halfSide*cos }
        ];
    }

    function carLocalToWorld(localX, localY, cx = car.x, cy = car.y, ca = car.angle) {
        const cos = Math.cos(ca), sin = Math.sin(ca);
        return { x: cx + localX*cos - localY*sin, y: cy + localX*sin + localY*cos };
    }

    function updateSteeringUIState() {
        const turnsAbsRaw = Math.abs(car.steeringTurns);
        if (isSteerInStraightZone) {
            if (turnsAbsRaw >= STEER_EXIT_STRAIGHT_THRESHOLD) isSteerInStraightZone = false;
        } else if (turnsAbsRaw <= STEER_ENTER_STRAIGHT_THRESHOLD) {
            isSteerInStraightZone = true;
        }
        const displayTurns = isSteerInStraightZone ? 0 : car.steeringTurns;
        const turnsAbs = Math.abs(displayTurns).toFixed(2);
        let steerText = "";
        if (displayTurns < 0) steerText = `Lái trái: ${turnsAbs}`;
        else if (displayTurns > 0) steerText = `Lái phải: ${turnsAbs}`;
        else steerText = `Thẳng lái: 0.00`;
        if (sharedDom.hudSteer) sharedDom.hudSteer.innerText = steerText;
        if (sharedDom.steerDisplay) sharedDom.steerDisplay.innerText = steerText;
        sharedDom.wheelImg.style.transform = `rotate(${displayTurns * 360}deg)`;
    }

    function updateHudPosition() {
        if (!sharedDom.carHud) return;
        const vCenterX = car.x + Math.cos(car.angle) * (ENV.carW * 0.28);
        const vCenterY = car.y + Math.sin(car.angle) * (ENV.carW * 0.28);
        const screenX = vCenterX + mapOffsetX;
        const screenY = vCenterY + mapOffsetY;
        sharedDom.carHud.style.left = `${screenX}px`;
        sharedDom.carHud.style.top = `${screenY - 110}px`;
        if (sharedDom.carHud.classList.contains('hidden')) {
            sharedDom.carHud.classList.remove('hidden');
        }
    }

    function updateGuideDots(now) {
        if (!guideDots || guideDots.length === 0) return;
        const vCenterX = car.x + Math.cos(car.angle) * (ENV.carW * 0.28);
        const vCenterY = car.y + Math.sin(car.angle) * (ENV.carW * 0.28);
        const pointInRect = (px, py, rect) => rect && px >= rect.minX && px <= rect.maxX && py >= rect.minY && py <= rect.maxY;
        for (const dot of guideDots) {
            const wasActive = dot.active;
            let isActive = false;
            if (dot.activationRect) {
                isActive = pointInRect(vCenterX, vCenterY, dot.activationRect);
            } else if (dot.activationPoly && Array.isArray(dot.activationPoly) && dot.activationPoly.length >= 6) {
                const poly = dot.activationPoly;
                let inside = false;
                for (let i = 0, j = poly.length - 2; i < poly.length; i += 2) {
                    const xi = poly[i], yi = poly[i+1];
                    const xj = poly[j], yj = poly[j+1];
                    const intersect = ((yi > vCenterY) !== (yj > vCenterY)) && (vCenterX < (xj - xi) * (vCenterY - yi) / (yj - yi) + xi);
                    if (intersect) inside = !inside;
                    j = i;
                }
                isActive = inside;
            } else {
                const dx = vCenterX - dot.x;
                const dy = vCenterY - dot.y;
                isActive = Math.hypot(dx, dy) <= (dot.proximity || 160);
            }
            dot.active = !!isActive;
            if (dot.active) {
                if (!wasActive) {
                    dot.blinkPhase = 0;
                    dot.lastToggle = now;
                } else if (now - dot.lastToggle >= GUIDE_DOT_BLINK_INTERVAL_MS) {
                    dot.blinkPhase = 1 - (dot.blinkPhase || 0);
                    dot.lastToggle = now;
                }
            } else {
                dot.blinkPhase = 0;
                dot.lastToggle = 0;
            }
        }
    }

    function prepareCarImageCrop() {
        prepareImageCrop(carImage, carImageCrop);
    }

    function draw() {
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(mapOffsetX, mapOffsetY);

        // Draw road area
        if (borderLines.length) {
            ctx.beginPath();
            ctx.moveTo(borderLines[0].x1, borderLines[0].y1);
            for (let i = 0; i < borderLines.length; i++) {
                ctx.lineTo(borderLines[i].x2, borderLines[i].y2);
            }
            ctx.closePath();
            ctx.fillStyle = '#64748b';
            ctx.fill();
            ctx.lineWidth = 5;
            ctx.strokeStyle = 'white';
            ctx.setLineDash([]);
            ctx.stroke();
            ctx.strokeStyle = '#ef4444';
            ctx.setLineDash([15, 15]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Yellow lines
        ctx.beginPath();
        yellowLines.forEach(l => { ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); });
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Guide dots
        ctx.save();
        ctx.shadowBlur = 16;
        for (const dot of guideDots) {
            const color = dot.active ? (dot.blinkPhase ? GUIDE_DOT_COLOR_B : GUIDE_DOT_COLOR_A) : GUIDE_DOT_COLOR_A;
            ctx.fillStyle = color;
            ctx.shadowColor = color + '66';
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, GUIDE_DOT_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Debug: activation rects
        if (window._currentGameModule && window._currentGameModule.getDebugMode && window._currentGameModule.getDebugMode()) {
            ctx.save();
            const hs = GUIDE_HANDLE_SIZE_PX;
            const half = Math.round(hs/2);
            guideDots.forEach((gd, idx) => {
                if (!gd.activationRect) return;
                const r = gd.activationRect;
                const strokeCol = ['rgba(56,189,248,0.9)', 'rgba(251,146,60,0.9)', 'rgba(34,197,94,0.9)', 'rgba(168,85,247,0.9)'][idx % 4];
                const fillCol = strokeCol.replace('0.9', '0.08');
                const handleCol = strokeCol.replace('0.9', '0.95');
                ctx.strokeStyle = strokeCol;
                ctx.fillStyle = fillCol;
                ctx.lineWidth = 2;
                ctx.setLineDash([6,6]);
                ctx.fillRect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY);
                ctx.strokeRect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY);
                ctx.setLineDash([]);
                ctx.fillStyle = handleCol;
                ctx.fillRect(Math.round(r.minX)-half, Math.round(r.minY)-half, hs, hs);
                ctx.fillRect(Math.round(r.maxX)-half, Math.round(r.minY)-half, hs, hs);
                ctx.fillRect(Math.round(r.maxX)-half, Math.round(r.maxY)-half, hs, hs);
                ctx.fillRect(Math.round(r.minX)-half, Math.round(r.maxY)-half, hs, hs);
            });
            ctx.restore();
        }

        // Dimensions display
        if (showDimensions) {
            ctx.fillStyle = '#fde047';
            ctx.font = 'bold 12px monospace';
            // Ghép dọc (Ld, Rd, Ed)
            if (ENV.Ld_m !== undefined && ENV.Rd_m !== undefined && ENV.Ed_m !== undefined) {
                ctx.fillText(`Ld = ${ENV.Ld_m.toFixed(2)}m`, ENV.spotBorderRight + 15, ENV.chipTop + ENV.Ld/2);
                ctx.fillText(`Rd = ${ENV.Rd_m.toFixed(2)}m`, ENV.chipLeft + ENV.Rd/2, ENV.chipBottom + 40);
                ctx.fillText(`Ed = ${ENV.Ed_m.toFixed(2)}m`, ENV.mapLeft + 50, ENV.roadBottom + 20);
                // Ed xoay dọc (nếu muốn giữ như cũ)
                ctx.save();
                ctx.translate(ENV.rightRoadLeft - 15, ENV.roadTop - 40);
                ctx.rotate(-Math.PI/2);
                ctx.fillText(`Ed = ${ENV.Ed_m.toFixed(2)}m`, 0, 0);
                ctx.restore();
            }
            // Ghép ngang (Lg, Rg)
            if (ENV.Lg_m !== undefined && ENV.Rg_m !== undefined) {
                ctx.fillText(`Lg = ${ENV.Lg_m.toFixed(2)}m`, ENV.borderRight + 12, ENV.chipTop + ENV.Lg / 2);
                ctx.fillText(`Rg = ${ENV.Rg_m.toFixed(2)}m`, ENV.chipLeft + ENV.Rg / 2, ENV.borderBottom + 20);
            }
        }

        // Draw car
        ctx.save();
        ctx.translate(car.x, car.y);
        ctx.rotate(car.angle);
        if (carImage.complete && carImage.naturalWidth) {
            prepareCarImageCrop();
            if (carImageCrop.ready) {
                ctx.drawImage(carImage, carImageCrop.sx, carImageCrop.sy, carImageCrop.sw, carImageCrop.sh,
                    -ENV.carW * 0.22, -ENV.carH/2, ENV.carW, ENV.carH);
            }
        } else {
            ctx.fillStyle = 'red';
            ctx.fillRect(-ENV.carW * 0.22, -ENV.carH/2, ENV.carW, ENV.carH);
        }
        ctx.restore();

        // Guide lines
        const allX = borderLines.flatMap(l => [l.x1, l.x2]);
        const allY = borderLines.flatMap(l => [l.y1, l.y2]);
        const mapMinX = Math.min(...allX);
        const mapMaxX = Math.max(...allX);
        const mapMinY = Math.min(...allY);
        const mapMaxY = Math.max(...allY);
        const steeringPos = carLocalToWorld(ENV.carW * STEERING_LOCAL_RATIO.x, ENV.carH * STEERING_LOCAL_RATIO.y);
        const driverPos = carLocalToWorld(ENV.carW * DRIVER_SEAT_LOCAL_RATIO.x, ENV.carH * DRIVER_SEAT_LOCAL_RATIO.y);
        const dirLong = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
        const dirSide = { x: -Math.sin(car.angle), y: Math.cos(car.angle) };
        ctx.save();
        ctx.strokeStyle = 'rgba(253, 230, 138, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 8]);
        drawClippedGuideLine(ctx, steeringPos.x, steeringPos.y, dirLong.x, dirLong.y, mapMinX, mapMinY, mapMaxX, mapMaxY);
        drawClippedGuideLine(ctx, driverPos.x, driverPos.y, dirSide.x, dirSide.y, mapMinX, mapMinY, mapMaxX, mapMaxY);
        ctx.setLineDash([]);
        ctx.restore();

        ctx.restore(); // end translate

        // Debug crosshair
        if (window._currentGameModule && window._currentGameModule.getDebugMode && window._currentGameModule.getDebugMode()) {
            const vCenterX = car.x + Math.cos(car.angle) * (ENV.carW * 0.28);
            const vCenterY = car.y + Math.sin(car.angle) * (ENV.carW * 0.28);
            const carCanvasX = Math.round(vCenterX + mapOffsetX);
            const carCanvasY = Math.round(vCenterY + mapOffsetY);
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(12, 12, 260, 44);
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.strokeRect(12, 12, 260, 44);
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px monospace';
            ctx.fillText(`Car center (canvas): ${carCanvasX}, ${carCanvasY}`, 18, 30);
            ctx.fillText(`Car center (world): ${vCenterX.toFixed(2)}, ${vCenterY.toFixed(2)}`, 18, 46);
            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(carCanvasX - 6, carCanvasY);
            ctx.lineTo(carCanvasX + 6, carCanvasY);
            ctx.moveTo(carCanvasX, carCanvasY - 6);
            ctx.lineTo(carCanvasX, carCanvasY + 6);
            ctx.stroke();
        }
    }

    function updateGame(now) {
        const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
        lastTime = now;
        let steerDelta = GAME_CONFIG.steerSpeed * dt;
        if (keys.A) car.steeringTurns -= steerDelta;
        if (keys.D) car.steeringTurns += steerDelta;
        car.steeringTurns = Math.min(GAME_CONFIG.maxSteerTurns, Math.max(-GAME_CONFIG.maxSteerTurns, car.steeringTurns));
        updateSteeringUIState();

        let hitBorder = false, hitYellow = false;
        if (car.isMoving && car.gear !== 0) {
            const wheelAngle = (car.steeringTurns / GAME_CONFIG.maxSteerTurns) * GAME_CONFIG.maxSteerAngleRad;
            const vel = GAME_CONFIG.moveSpeed * 60 * dt * car.gear;
            const nextX = car.x + Math.cos(car.angle) * vel;
            const nextY = car.y + Math.sin(car.angle) * vel;
            const nextAngle = car.angle + (vel / (ENV.carW * 0.6)) * Math.tan(wheelAngle);
            const nextCorners = getCarCorners(nextX, nextY, nextAngle);
            hitBorder = hasAnyEdgeIntersection(getCarEdges(nextCorners), borderLines);
            if (!hitBorder) {
                car.x = nextX;
                car.y = nextY;
                car.angle = nextAngle;
            }
        }
        updateGuideDots(now);
        const currCorners = getCarCorners();
        const currEdges = getCarEdges(currCorners);
        hitYellow = hasAnyEdgeIntersection(currEdges, yellowLines);
        if (!hitBorder) hitBorder = hasAnyEdgeIntersection(currEdges, borderLines);

        if (!hasParkingSuccess && checkParkingSuccess(car, ENV, SCALE)) hasParkingSuccess = true;
        if (hasParkingSuccess && !hasExerciseCompleted && checkExerciseCompleted(car, ENV)) hasExerciseCompleted = true;

        updateHudPosition();
        if (hitBorder) showWarningMsg('XE CHẠM LỀ', '#991b1b');
        else if (hitYellow) showWarningMsg('XE ĐÈ VẠCH', '#ef4444');
        else if (hasExerciseCompleted) showWarningMsg('HOÀN THÀNH BÀI GHÉP XE', '#065f46');
        else if (hasParkingSuccess) showWarningMsg('GHÉP XE THÀNH CÔNG', '#15803d');
        else warningDiv.style.display = 'none';
    }

    function resizeAndOffset() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const allX = borderLines.flatMap(l => [l.x1, l.x2]);
        const allY = borderLines.flatMap(l => [l.y1, l.y2]);
        const minX = Math.min(...allX);
        const maxX = Math.max(...allX);
        const minY = Math.min(...allY);
        const maxY = Math.max(...allY);
        const mapW = maxX - minX, mapH = maxY - minY;
        mapOffsetX = (canvas.width - mapW) / 2 - minX;
        mapOffsetY = (canvas.height - mapH) / 2 - minY;
    }

    function resetCarPosition() {
        car.x = initialCarState.x;
        car.y = initialCarState.y;
        car.angle = initialCarState.angle;
        car.steeringTurns = 0;
        isSteerInStraightZone = true;
        car.isMoving = false;
        hasParkingSuccess = false;
        hasExerciseCompleted = false;
        warningDiv.style.display = 'none';
        updateGearUI();
    }

    function refreshParams() {
        CAR_A = parseFloat(sharedDom.cfgCarA.value);
        CAR_B = parseFloat(sharedDom.cfgCarB.value);
        ENV = buildEnvironment(CAR_A, CAR_B, SCALE);
        yellowLines = getYellowLines(ENV);
        borderLines = getBorderLines(ENV);
        guideDots = getGuideDots(ENV);
        resizeAndOffset();
        resetCarPosition();
    }

    function loop(ts) {
        updateGame(ts);
        draw();
        animationId = requestAnimationFrame(loop);
    }

    function setupEvents() {
        const keydown = (e) => {
            if (e.target.tagName !== 'INPUT') {
                if (controlMode === 'hybrid') {
                    if (e.key === 'a' || e.key === 'A') keys.A = true;
                    if (e.key === 'd' || e.key === 'D') keys.D = true;
                } else {
                    if (e.key === 'ArrowLeft') keys.A = true;
                    if (e.key === 'ArrowRight') keys.D = true;
                }
                if (controlMode === 'kb') {
                    if (e.key === ' ' || e.code === 'Space') {
                        car.isMoving = true;
                        e.preventDefault();
                    }
                    const k = e.key.toLowerCase();
                    if (k === 'd') { car.gear = 1; updateGearUI(); }
                    if (k === 'r') { car.gear = -1; updateGearUI(); }
                }
            }
        };
        const keyup = (e) => {
            if (controlMode === 'hybrid') {
                if (e.key === 'a' || e.key === 'A') keys.A = false;
                if (e.key === 'd' || e.key === 'D') keys.D = false;
            } else {
                if (e.key === 'ArrowLeft') keys.A = false;
                if (e.key === 'ArrowRight') keys.D = false;
            }
            if (controlMode === 'kb' && (e.key === ' ' || e.code === 'Space')) car.isMoving = false;
        };
        const wheel = (e) => {
            if (controlMode === 'hybrid' && !e.target.closest('.modal-backdrop')) {
                car.gear = e.deltaY < 0 ? 1 : -1;
                updateGearUI();
                e.preventDefault();
            }
        };
        const mousedown = (e) => { if (controlMode === 'hybrid' && e.button === 0) car.isMoving = true; };
        const mouseup = () => { if (controlMode === 'hybrid') car.isMoving = false; };
        const mouseleaveCanvas = () => { if (controlMode === 'hybrid') car.isMoving = false; };

        window.addEventListener('keydown', keydown);
        window.addEventListener('keyup', keyup);
        window.addEventListener('wheel', wheel, { passive: false });
        canvas.addEventListener('mousedown', mousedown);
        window.addEventListener('mouseup', mouseup);
        canvas.addEventListener('mouseleave', mouseleaveCanvas);

        const rightClick = (e) => {
            if (e.target === canvas) {
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const canvasX = e.clientX - rect.left;
                const canvasY = e.clientY - rect.top;
                const worldX = canvasX - mapOffsetX;
                const worldY = canvasY - mapOffsetY;
                console.log('MOUSE POS:', { canvasX: Math.round(canvasX), canvasY: Math.round(canvasY), worldX: Number(worldX.toFixed(2)), worldY: Number(worldY.toFixed(2)) });
                showWarningMsg(`CURSOR: ${Math.round(canvasX)},${Math.round(canvasY)}  MAP:${worldX.toFixed(1)},${worldY.toFixed(1)}`, '#0ea5e9');
            }
        };
        canvas.addEventListener('contextmenu', rightClick);

        let activationDrag = null;
        const pointDistance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
        const onPointerDown = (e) => {
            if (e.button !== 0) return;
            const debugMode = window._currentGameModule && window._currentGameModule.getDebugMode && window._currentGameModule.getDebugMode();
            if (!debugMode) return;
            if (!e.shiftKey) return;
            const rect = canvas.getBoundingClientRect();
            const canvasX = e.clientX - rect.left;
            const canvasY = e.clientY - rect.top;
            if (!guideDots) return;
            const hs = GUIDE_HANDLE_SIZE_PX;
            for (let idx = 0; idx < guideDots.length; idx++) {
                const gd = guideDots[idx];
                if (!gd.activationRect) continue;
                const ar = gd.activationRect;
                const tl = { x: Math.round(ar.minX + mapOffsetX), y: Math.round(ar.minY + mapOffsetY) };
                const tr = { x: Math.round(ar.maxX + mapOffsetX), y: Math.round(ar.minY + mapOffsetY) };
                const br = { x: Math.round(ar.maxX + mapOffsetX), y: Math.round(ar.maxY + mapOffsetY) };
                const bl = { x: Math.round(ar.minX + mapOffsetX), y: Math.round(ar.maxY + mapOffsetY) };
                if (pointDistance(canvasX, canvasY, tl.x, tl.y) <= hs) {
                    activationDrag = { dotIndex: idx, type: 'resize', corner: 'tl', startCanvasX: canvasX, startCanvasY: canvasY, origRect: Object.assign({}, ar) };
                    e.preventDefault(); e.stopPropagation(); return;
                }
                if (pointDistance(canvasX, canvasY, tr.x, tr.y) <= hs) {
                    activationDrag = { dotIndex: idx, type: 'resize', corner: 'tr', startCanvasX: canvasX, startCanvasY: canvasY, origRect: Object.assign({}, ar) };
                    e.preventDefault(); e.stopPropagation(); return;
                }
                if (pointDistance(canvasX, canvasY, br.x, br.y) <= hs) {
                    activationDrag = { dotIndex: idx, type: 'resize', corner: 'br', startCanvasX: canvasX, startCanvasY: canvasY, origRect: Object.assign({}, ar) };
                    e.preventDefault(); e.stopPropagation(); return;
                }
                if (pointDistance(canvasX, canvasY, bl.x, bl.y) <= hs) {
                    activationDrag = { dotIndex: idx, type: 'resize', corner: 'bl', startCanvasX: canvasX, startCanvasY: canvasY, origRect: Object.assign({}, ar) };
                    e.preventDefault(); e.stopPropagation(); return;
                }
                const inside = canvasX >= tl.x && canvasX <= br.x && canvasY >= tl.y && canvasY <= br.y;
                if (inside) {
                    activationDrag = { dotIndex: idx, type: 'move', startCanvasX: canvasX, startCanvasY: canvasY, origRect: Object.assign({}, ar) };
                    e.preventDefault(); e.stopPropagation(); return;
                }
            }
        };
        const onPointerMove = (e) => {
            if (!activationDrag) return;
            const rect = canvas.getBoundingClientRect();
            const canvasX = e.clientX - rect.left;
            const canvasY = e.clientY - rect.top;
            const dx = canvasX - activationDrag.startCanvasX;
            const dy = canvasY - activationDrag.startCanvasY;
            const idx = activationDrag.dotIndex;
            if (!guideDots[idx]) return;
            if (activationDrag.type === 'move') {
                const newMinX = activationDrag.origRect.minX + dx;
                const newMaxX = activationDrag.origRect.maxX + dx;
                const newMinY = activationDrag.origRect.minY + dy;
                const newMaxY = activationDrag.origRect.maxY + dy;
                guideDots[idx].activationRect = { minX: newMinX, minY: newMinY, maxX: newMaxX, maxY: newMaxY };
            } else if (activationDrag.type === 'resize') {
                const ar = Object.assign({}, activationDrag.origRect);
                if (activationDrag.corner === 'tl') { ar.minX += dx; ar.minY += dy; }
                else if (activationDrag.corner === 'tr') { ar.maxX += dx; ar.minY += dy; }
                else if (activationDrag.corner === 'br') { ar.maxX += dx; ar.maxY += dy; }
                else if (activationDrag.corner === 'bl') { ar.minX += dx; ar.maxY += dy; }
                const minX = Math.min(ar.minX, ar.maxX), maxX = Math.max(ar.minX, ar.maxX);
                const minY = Math.min(ar.minY, ar.maxY), maxY = Math.max(ar.minY, ar.maxY);
                guideDots[idx].activationRect = { minX, minY, maxX, maxY };
            }
            console.log(`Dot${idx+1} rect:`, guideDots[idx].activationRect);
            draw();
            e.preventDefault();
        };
        const endPointer = () => { activationDrag = null; };
        canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
        canvas.addEventListener('mousedown', onPointerDown, { passive: false, capture: true });
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('pointerup', endPointer);
        window.addEventListener('mouseup', endPointer);

        sharedDom.btnReset.onclick = () => { resetCarPosition(); car.gear = 1; updateGearUI(); };
        sharedDom.cfgCarA.oninput = () => refreshParams();
        sharedDom.cfgCarB.oninput = () => refreshParams();
        sharedDom.cfgMoveSpeed.oninput = (e) => { GAME_CONFIG.moveSpeed = parseFloat(e.target.value); };
        sharedDom.cfgSteerSpeed.oninput = (e) => { GAME_CONFIG.steerSpeed = parseFloat(e.target.value); };

        return () => {
            window.removeEventListener('keydown', keydown);
            window.removeEventListener('keyup', keyup);
            window.removeEventListener('wheel', wheel);
            canvas.removeEventListener('mousedown', mousedown);
            canvas.removeEventListener('contextmenu', rightClick);
            window.removeEventListener('mouseup', mouseup);
            canvas.removeEventListener('mouseleave', mouseleaveCanvas);
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('mousedown', onPointerDown, { capture: true });
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('mousemove', onPointerMove);
            window.removeEventListener('pointerup', endPointer);
            window.removeEventListener('mouseup', endPointer);
        };
    }

    // Initialization
    ENV = buildEnvironment(CAR_A, CAR_B, SCALE);
    yellowLines = getYellowLines(ENV);
    borderLines = getBorderLines(ENV);
    guideDots = getGuideDots(ENV);
    resizeAndOffset();
    updateGearUI();
    updateSteeringUIState();
    const removeEvents = setupEvents();
    animationId = requestAnimationFrame(loop);
    window.addEventListener('resize', resizeAndOffset);

    const publicAPI = {
        setShowDimensions: (val) => { showDimensions = val; draw(); },
        setWheelOpacity: (val) => { wheelOpacity = clamp01(val); document.documentElement.style.setProperty('--wheel-opacity', String(wheelOpacity)); draw(); },
        setDashOpacity: (val) => { dashOpacity = clamp01(val); document.documentElement.style.setProperty('--dash-opacity', String(dashOpacity)); draw(); },
        setDebugMode: (val) => { if (window._currentGameModule) window._currentGameModule._debugMode = !!val; draw(); },
        getDebugMode: () => window._currentGameModule && window._currentGameModule._debugMode
    };
    window._currentGameModule = publicAPI;
    document.documentElement.style.setProperty('--wheel-opacity', String(wheelOpacity));
    document.documentElement.style.setProperty('--dash-opacity', String(dashOpacity));

    return () => {
        if (animationId) cancelAnimationFrame(animationId);
        if (hudRestoreTimer) clearTimeout(hudRestoreTimer);
        window.removeEventListener('resize', resizeAndOffset);
        removeEvents();
        if (window._currentGameModule === publicAPI) window._currentGameModule = null;
    };
}

// ---------- Global exports ----------
if (typeof window !== 'undefined') {
    window.linesIntersect = linesIntersect;
    window.drawClippedGuideLine = drawClippedGuideLine;
    window.GameUtils = {
        clamp01,
        getCarEdges,
        hasAnyEdgeIntersection,
        showWarning,
        prepareImageCrop,
        createParkingGame,
        PARKING_BASE
    };
}