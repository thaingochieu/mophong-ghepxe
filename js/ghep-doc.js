// Ghép xe dọc
function initGhepDoc(sharedDom, options = {}) {
    const SCALE = 45;
    const PARKING_CLEARANCE_LENGTH_M = 0.6;
    const PARKING_CLEARANCE_WIDTH_M = 0.6;
    const COLLISION_FRONT_SCALE = 0.80;
    const COLLISION_REAR_SCALE = 0.72;
    const COLLISION_SIDE_SCALE = 0.72;
    const STEERING_LOCAL_RATIO = { x: 0.50, y: -0.16 };
    const DRIVER_SEAT_LOCAL_RATIO = { x: 0.30, y: -0.20 };
    const HUD_DASH_OPACITY_OVERLAP = 0.18;
    const HUD_RESTORE_DELAY_MS = 250;
    const STEER_ENTER_STRAIGHT_THRESHOLD = 0.015;
    const STEER_EXIT_STRAIGHT_THRESHOLD = 0.03;
    const GUIDE_DOT_RADIUS = 10;
    const GUIDE_DOT_BLINK_INTERVAL_MS = 480;
    const GUIDE_DOT_DEFAULT_PROXIMITY_PX = 160;
    const GUIDE_DOT_COLOR_A = '#3ef838';
    const GUIDE_DOT_COLOR_B = '#fb923c';
    const GUIDE_HANDLE_SIZE_PX = 20;
    const RIGHT_ROAD_EXTRA_DEPTH_PX = 350;
    const SPOT_BOTTOM_GAP_PX = 28;

    // ========== DEBUG FLAG ==========
    let DEBUG_MODE = true; // bật/tắt toàn bộ giao diện debug

    const canvas = sharedDom.canvas;
    const ctx = canvas.getContext('2d');
    const warningDiv = sharedDom.warningMsg;
    const carImage = sharedDom.carImg;

    const linesIntersect = window.linesIntersect || function(a,b,c,d,p,q,r,s) {
        const det = (c - a) * (s - q) - (r - p) * (d - b);
        if (det === 0) return false;
        const lambda = ((s - q) * (r - a) + (p - r) * (s - b)) / det;
        const gamma = ((b - d) * (r - a) + (c - a) * (s - b)) / det;
        return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
    };
    const drawClippedGuideLine = window.drawClippedGuideLine || function(ctx, px, py, dx, dy, minX, minY, maxX, maxY) {
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
    };
    const gameUtils = window.GameUtils || {};
    const clamp01 = gameUtils.clamp01 || ((val) => Math.min(1, Math.max(0, Number(val))));
    const getCarEdges = gameUtils.getCarEdges || function(corners) {
        return [[corners[0], corners[1]], [corners[1], corners[2]], [corners[2], corners[3]], [corners[3], corners[0]]];
    };
    const hasAnyEdgeIntersection = gameUtils.hasAnyEdgeIntersection || function(edges, lines) {
        for (const edge of edges) {
            for (const line of lines) {
                if (linesIntersect(edge[0].x, edge[0].y, edge[1].x, edge[1].y, line.x1, line.y1, line.x2, line.y2)) {
                    return true;
                }
            }
        }
        return false;
    };
    const prepareImageCrop = gameUtils.prepareImageCrop || function(image, cropState) {
        if (!image || !cropState) return false;
        if (!image.complete || image.naturalWidth <= 0) return false;
        if (cropState.ready) return true;
        const w = image.naturalWidth, h = image.naturalHeight;
        const offCanvas = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(image, 0, 0);
        const imgData = offCtx.getImageData(0, 0, w, h).data;
        let minX = w, minY = h, maxX = 0, maxY = 0;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (imgData[(y * w + x) * 4 + 3] > 12) {
                    minX = Math.min(minX, x); minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
                }
            }
        }
        if (maxX >= minX && maxY >= minY) {
            cropState.sx = minX; cropState.sy = minY;
            cropState.sw = maxX - minX + 1; cropState.sh = maxY - minY + 1;
        } else {
            cropState.sx = 0; cropState.sy = 0;
            cropState.sw = w; cropState.sh = h;
        }
        cropState.ready = true;
        return true;
    };

    let showDimensions = options.showDimensions !== undefined ? options.showDimensions : true;
    let wheelOpacity = options.wheelOpacity !== undefined ? Number(options.wheelOpacity) : 0.15;
    let dashOpacity = options.dashOpacity !== undefined ? Number(options.dashOpacity) : 0.92;
    let controlMode = options.controlMode || 'kb';

    const applyWheelOpacity = (val) => {
        wheelOpacity = clamp01(val);
        document.documentElement.style.setProperty('--wheel-opacity', String(wheelOpacity));
    };
    const applyDashOpacity = (val) => {
        dashOpacity = clamp01(val);
        document.documentElement.style.setProperty('--dash-opacity', String(dashOpacity));
    };

    window._currentGameModule = {
        showDimensions,
        setShowDimensions: (val) => {
            showDimensions = val;
            draw();
        },
        setWheelOpacity: applyWheelOpacity,
        setDashOpacity: applyDashOpacity,
        // cho phép bật/tắt debug từ console
        setDebugMode: (val) => {
            DEBUG_MODE = !!val;
            draw();
        },
        getDebugMode: () => DEBUG_MODE
    };
    document.documentElement.style.setProperty('--wheel-opacity', String(wheelOpacity));
    document.documentElement.style.setProperty('--dash-opacity', String(dashOpacity));

    let ENV = {}, yellowLines = [], borderLines = [];
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
        x: 0, y: 0,
        angle: Math.PI / 2,
        steeringTurns: 0,
        gear: 1,
        isMoving: false
    };
    const keys = { A: false, D: false };
    let isSteerInStraightZone = true;
    let hasParkingSuccess = false, hasExerciseCompleted = false;
    let lastTime = 0, animationId = null;
    let hudRect = null;
    let isHudOverlapped = false;
    let hudRestoreTimer = null;

    let guideDots = [];

    const carImageCrop = { sx: 0, sy: 0, sw: 0, sh: 0, ready: false };

    function calculateEnvironment() {
        const Ld_m = CAR_A + PARKING_CLEARANCE_LENGTH_M;
        const Rd_m = CAR_B + PARKING_CLEARANCE_WIDTH_M;
        const Ed_m = 1.2 * CAR_A;
        ENV.carW = CAR_A * SCALE;
        ENV.carH = CAR_B * SCALE;
        ENV.Ld = Ld_m * SCALE;
        ENV.Rd = Rd_m * SCALE;
        ENV.Ed = Ed_m * SCALE;
        ENV.Ld_m = Ld_m;
        ENV.Rd_m = Rd_m;
        ENV.Ed_m = Ed_m;
        const MARGIN = 18;
        ENV.mapLeft = 40;
        ENV.roadTop = 260;
        const baseRoadTop = ENV.roadTop;
        const baseRoadBottom = baseRoadTop + ENV.Ed;
        ENV.rightRoadTop = 40;
        ENV.rightRoadBottom = baseRoadBottom + RIGHT_ROAD_EXTRA_DEPTH_PX;
        ENV.spotBorderLeft = ENV.mapLeft + ENV.Ed + 20;

        const baseSpotBorderBottom = baseRoadBottom + (2 * MARGIN) + ENV.Ld;
        const desiredSpotBorderBottom = ENV.rightRoadBottom - SPOT_BOTTOM_GAP_PX;
        const spotVerticalOffset = desiredSpotBorderBottom - baseSpotBorderBottom;
        ENV.roadTop = baseRoadTop + spotVerticalOffset;
        ENV.roadBottom = ENV.roadTop + ENV.Ed;

        ENV.chipTop = ENV.roadBottom + MARGIN;
        ENV.chipBottom = ENV.chipTop + ENV.Ld;
        ENV.chipLeft = ENV.spotBorderLeft + MARGIN;
        ENV.chipRight = ENV.chipLeft + ENV.Rd;
        ENV.spotBorderRight = ENV.chipRight + MARGIN;
        ENV.spotBorderBottom = ENV.chipBottom + MARGIN;
        ENV.rightRoadLeft = ENV.spotBorderRight + ENV.Ed;
        ENV.rightRoadRight = ENV.rightRoadLeft + ENV.Ed;

        yellowLines = [
            { x1: ENV.chipLeft, y1: ENV.chipTop, x2: ENV.chipLeft, y2: ENV.chipBottom },
            { x1: ENV.chipRight, y1: ENV.chipTop, x2: ENV.chipRight, y2: ENV.chipBottom },
            { x1: ENV.chipLeft, y1: ENV.chipBottom, x2: ENV.chipRight, y2: ENV.chipBottom }
        ];
        borderLines = [
            {x1: ENV.mapLeft, y1: ENV.roadTop, x2: ENV.rightRoadLeft, y2: ENV.roadTop},
            {x1: ENV.rightRoadLeft, y1: ENV.roadTop, x2: ENV.rightRoadLeft, y2: ENV.rightRoadTop},
            {x1: ENV.rightRoadLeft, y1: ENV.rightRoadTop, x2: ENV.rightRoadRight, y2: ENV.rightRoadTop},
            {x1: ENV.rightRoadRight, y1: ENV.rightRoadTop, x2: ENV.rightRoadRight, y2: ENV.rightRoadBottom},
            {x1: ENV.rightRoadRight, y1: ENV.rightRoadBottom, x2: ENV.rightRoadLeft, y2: ENV.rightRoadBottom},
            {x1: ENV.rightRoadLeft, y1: ENV.rightRoadBottom, x2: ENV.rightRoadLeft, y2: ENV.roadBottom},
            {x1: ENV.rightRoadLeft, y1: ENV.roadBottom, x2: ENV.spotBorderRight, y2: ENV.roadBottom},
            {x1: ENV.spotBorderRight, y1: ENV.roadBottom, x2: ENV.spotBorderRight, y2: ENV.spotBorderBottom},
            {x1: ENV.spotBorderRight, y1: ENV.spotBorderBottom, x2: ENV.spotBorderLeft, y2: ENV.spotBorderBottom},
            {x1: ENV.spotBorderLeft, y1: ENV.spotBorderBottom, x2: ENV.spotBorderLeft, y2: ENV.roadBottom},
            {x1: ENV.spotBorderLeft, y1: ENV.roadBottom, x2: ENV.mapLeft, y2: ENV.roadBottom},
            {x1: ENV.mapLeft, y1: ENV.roadBottom, x2: ENV.mapLeft, y2: ENV.roadTop}
        ];

        // Tất cả activationRect lưu ở WORLD coordinates
        guideDots = [
            {
                x: ENV.mapLeft,
                y: ENV.roadBottom - ENV.Ed * 0.2,
                activationRect: {
                    minX: 450,
                    minY: 350,
                    maxX: 650,
                    maxY: 550
                },
                active: false,
                blinkPhase: 0,
                lastToggle: 0
            },
            {
                x: ENV.chipLeft + ENV.Rd * 0.5,
                y: ENV.chipBottom - ENV.Ld * -0.09,
                activationRect: {
                    minX: 330,
                    minY: 400,
                    maxX: 430,
                    maxY: 550
                },
                active: false,
                blinkPhase: 0,
                lastToggle: 0
            },
            {
                x: ENV.chipLeft + ENV.Rd * 1.15,
                y: ENV.chipBottom - ENV.Ld * 0.72,
                activationRect: {
                    minX: 225,
                    minY: 350,
                    maxX: 320,
                    maxY: 470
                },
                active: false,
                blinkPhase: 0,
                lastToggle: 0
            }
        ];
    }

    // Cập nhật trạng thái chấm căn (dùng tâm hình học của xe)
    function updateGuideDots(now) {
        if (!guideDots || guideDots.length === 0) return;

        const vCenterX = car.x + Math.cos(car.angle) * (ENV.carW * 0.28);
        const vCenterY = car.y + Math.sin(car.angle) * (ENV.carW * 0.28);

        const pointInRect = (px, py, rect) => {
            if (!rect) return false;
            return px >= rect.minX && px <= rect.maxX && py >= rect.minY && py <= rect.maxY;
        };

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
                const dist = Math.hypot(dx, dy);
                isActive = dist <= (dot.proximity || GUIDE_DOT_DEFAULT_PROXIMITY_PX);
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

    function setDot1Activation(spec) {
        if (!guideDots || !guideDots[0]) {
            console.warn('guideDots not ready yet');
            return;
        }
        const dot = guideDots[0];
        if (Array.isArray(spec)) {
            dot.activationPoly = spec.slice();
            delete dot.activationRect;
            console.log('Dot1 activation set to polygon');
        } else if (spec && spec.activationPoly && Array.isArray(spec.activationPoly)) {
            dot.activationPoly = spec.activationPoly.slice();
            delete dot.activationRect;
            console.log('Dot1 activation set to polygon');
        } else if (spec && typeof spec.minX !== 'undefined') {
            dot.activationRect = { minX: Number(spec.minX), minY: Number(spec.minY), maxX: Number(spec.maxX), maxY: Number(spec.maxY) };
            delete dot.activationPoly;
            console.log('Dot1 activation set to rect', dot.activationRect);
        } else if (spec && Array.isArray(spec.points) && spec.points.length >= 6) {
            dot.activationPoly = spec.points.slice();
            delete dot.activationRect;
            console.log('Dot1 activation set to polygon via spec.points');
        } else {
            console.warn('Invalid spec. Provide rect {minX,minY,maxX,maxY} or array [x1,y1,...]');
            return;
        }
        draw();
    }

    try { window._currentGameModule = window._currentGameModule || {}; window._currentGameModule.setDot1Activation = setDot1Activation; } catch (e) {}

    function resetCarPosition() {
        car.x = ENV.rightRoadLeft + (ENV.Ed / 2);
        car.y = ENV.rightRoadTop + (ENV.carW / 2);
        car.angle = Math.PI / 2;
        car.steeringTurns = 0;
        isSteerInStraightZone = true;
        car.isMoving = false;
        hasParkingSuccess = false;
        hasExerciseCompleted = false;
        warningDiv.style.display = 'none';
        updateGearUI();
    }

    function updateGearUI() {
        const gearText = car.gear === 1 ? "TIẾN" : "LÙI";
        if (sharedDom.hudGear) sharedDom.hudGear.innerText = gearText;
        if (sharedDom.gearDisplay) sharedDom.gearDisplay.innerText = gearText;
    }

    function intersectsRect(a, b) {
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }

    function updateHudOcclusion() {
        if (!hudRect) return;
        const corners = getCarCorners();
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const corner of corners) {
            const sx = corner.x + mapOffsetX;
            const sy = corner.y + mapOffsetY;
            if (sx < minX) minX = sx;
            if (sy < minY) minY = sy;
            if (sx > maxX) maxX = sx;
            if (sy > maxY) maxY = sy;
        }
        const carRect = { left: minX, top: minY, right: maxX, bottom: maxY };
        setHudOverlapState(intersectsRect(carRect, hudRect));
    }

    function showWarning(text, color) {
        if (gameUtils.showWarning) gameUtils.showWarning(warningDiv, text, color);
        else {
            warningDiv.innerText = text;
            warningDiv.style.backgroundColor = color;
            warningDiv.style.display = 'block';
        }
    }

    function getCarCorners(cx = car.x, cy = car.y, cangle = car.angle) {
        const cos = Math.cos(cangle), sin = Math.sin(cangle);
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

    function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const vx = x2 - x1, vy = y2 - y1;
        const wx = px - x1, wy = py - y1;
        const c1 = vx*wx + vy*wy;
        if (c1 <= 0) return Math.hypot(px - x1, py - y1);
        const c2 = vx*vx + vy*vy;
        if (c2 <= c1) return Math.hypot(px - x2, py - y2);
        const t = c1 / c2;
        const projX = x1 + t*vx, projY = y1 + t*vy;
        return Math.hypot(px - projX, py - projY);
    }

    function isCarInsideRightVerticalRoad() {
        const marginX = ENV.carH * 0.35, marginY = ENV.carW * 0.35;
        return (car.x >= ENV.rightRoadLeft + marginX && car.x <= ENV.rightRoadRight - marginX &&
            car.y >= ENV.rightRoadTop + marginY && car.y <= ENV.rightRoadBottom - marginY);
    }

    function updateParkingMilestones(hitBorder, hitYellow) {
        if (hitBorder || hitYellow) return;
        const inSpot = (car.x >= ENV.spotBorderLeft && car.x <= ENV.spotBorderRight && car.y >= ENV.roadBottom && car.y <= ENV.spotBorderBottom);
        if (!hasParkingSuccess && inSpot) {
            const corners = getCarCorners();
            const d1 = pointToSegmentDistance(corners[3].x, corners[3].y, yellowLines[2].x1, yellowLines[2].y1, yellowLines[2].x2, yellowLines[2].y2);
            const d2 = pointToSegmentDistance(corners[2].x, corners[2].y, yellowLines[2].x1, yellowLines[2].y1, yellowLines[2].x2, yellowLines[2].y2);
            const minDistM = Math.min(d1, d2) / SCALE;
            if (minDistM >= 0.1 && minDistM <= 0.3) hasParkingSuccess = true;
        }
        if (hasParkingSuccess && !hasExerciseCompleted && isCarInsideRightVerticalRoad()) hasExerciseCompleted = true;
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

    function prepareCarImageCrop() {
        prepareImageCrop(carImage, carImageCrop);
    }

    function draw() {
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(mapOffsetX, mapOffsetY);

        // Vẽ đường
        ctx.beginPath();
        ctx.moveTo(ENV.mapLeft, ENV.roadTop);
        ctx.lineTo(ENV.rightRoadLeft, ENV.roadTop);
        ctx.lineTo(ENV.rightRoadLeft, ENV.rightRoadTop);
        ctx.lineTo(ENV.rightRoadRight, ENV.rightRoadTop);
        ctx.lineTo(ENV.rightRoadRight, ENV.rightRoadBottom);
        ctx.lineTo(ENV.rightRoadLeft, ENV.rightRoadBottom);
        ctx.lineTo(ENV.rightRoadLeft, ENV.roadBottom);
        ctx.lineTo(ENV.spotBorderRight, ENV.roadBottom);
        ctx.lineTo(ENV.spotBorderRight, ENV.spotBorderBottom);
        ctx.lineTo(ENV.spotBorderLeft, ENV.spotBorderBottom);
        ctx.lineTo(ENV.spotBorderLeft, ENV.roadBottom);
        ctx.lineTo(ENV.mapLeft, ENV.roadBottom);
        ctx.closePath();
        ctx.fillStyle = '#64748b'; ctx.fill();

        ctx.lineWidth = 5; ctx.strokeStyle = 'white'; ctx.setLineDash([]); ctx.stroke();
        ctx.strokeStyle = '#ef4444'; ctx.setLineDash([15, 15]); ctx.stroke();
        ctx.setLineDash([]);

        // Vạch vàng
        ctx.beginPath();
        yellowLines.forEach(l => { ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); });
        ctx.strokeStyle = '#eab308'; ctx.lineWidth = 3; ctx.stroke();

        // Vẽ chấm căn
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

        // --- DEBUG: vẽ activation rect và handle (chỉ khi DEBUG_MODE bật) ---
        if (DEBUG_MODE && guideDots && guideDots.length) {
            ctx.save();
            const hs = GUIDE_HANDLE_SIZE_PX;
            const half = Math.round(hs/2);
            guideDots.forEach((gd, idx) => {
                if (!gd.activationRect) return;
                const r = gd.activationRect;
                const drawX = r.minX;
                const drawY = r.minY;
                const drawW = r.maxX - r.minX;
                const drawH = r.maxY - r.minY;
                const strokeCol = idx === 0 ? 'rgba(56,189,248,0.9)' : (idx === 1 ? 'rgba(251,146,60,0.9)' : 'rgba(34,197,94,0.9)');
                const fillCol = idx === 0 ? 'rgba(56,189,248,0.08)' : (idx === 1 ? 'rgba(251,146,60,0.08)' : 'rgba(34,197,94,0.08)');
                const handleCol = idx === 0 ? 'rgba(56,189,248,0.95)' : (idx === 1 ? 'rgba(251,146,60,0.95)' : 'rgba(34,197,94,0.95)');
                ctx.strokeStyle = strokeCol;
                ctx.fillStyle = fillCol;
                ctx.lineWidth = 2;
                ctx.setLineDash([6,6]);
                ctx.fillRect(drawX, drawY, drawW, drawH);
                ctx.strokeRect(drawX, drawY, drawW, drawH);
                ctx.setLineDash([]);
                ctx.fillStyle = handleCol;
                ctx.fillRect(Math.round(drawX)-half, Math.round(drawY)-half, hs, hs);
                ctx.fillRect(Math.round(drawX+drawW)-half, Math.round(drawY)-half, hs, hs);
                ctx.fillRect(Math.round(drawX+drawW)-half, Math.round(drawY+drawH)-half, hs, hs);
                ctx.fillRect(Math.round(drawX)-half, Math.round(drawY+drawH)-half, hs, hs);
            });
            ctx.restore();
        }

        if (showDimensions) {
            ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 12px monospace';
            ctx.fillText(`Ed = ${ENV.Ed_m.toFixed(2)}m`, ENV.mapLeft + 50, ENV.roadBottom + 20);
            ctx.save(); ctx.translate(ENV.rightRoadLeft - 15, ENV.roadTop - 40); ctx.rotate(-Math.PI/2); ctx.fillText(`Ed = ${ENV.Ed_m.toFixed(2)}m`, 0, 0); ctx.restore();
            ctx.fillStyle = '#fde047'; ctx.fillText(`Ld = ${ENV.Ld_m.toFixed(2)}m`, ENV.spotBorderRight + 15, ENV.chipTop + ENV.Ld/2);
            ctx.fillText(`Rd = ${ENV.Rd_m.toFixed(2)}m`, ENV.chipLeft + ENV.Rd/2, ENV.spotBorderBottom + 20);
        }

        // Vẽ xe
        ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
        if (carImage.complete && carImage.naturalWidth) {
            prepareCarImageCrop();
            if (carImageCrop.ready) {
                ctx.drawImage(carImage, carImageCrop.sx, carImageCrop.sy, carImageCrop.sw, carImageCrop.sh, -ENV.carW * 0.22, -ENV.carH / 2, ENV.carW, ENV.carH);
            }
        } else {
            ctx.fillStyle = 'red'; ctx.fillRect(-ENV.carW * 0.22, -ENV.carH / 2, ENV.carW, ENV.carH);
        }
        ctx.restore();

        // Đường căn
        const mapMinX = ENV.mapLeft;
        const mapMaxX = Math.max(ENV.rightRoadRight, ENV.spotBorderRight);
        const mapMinY = Math.min(ENV.roadTop, ENV.rightRoadTop);
        const mapMaxY = Math.max(ENV.rightRoadBottom, ENV.spotBorderBottom);
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

        ctx.restore(); // hết translate map

        // --- DEBUG: crosshair tâm xe và thông tin tọa độ (screen space) ---
        if (DEBUG_MODE) {
            const vCenterX = car.x + Math.cos(car.angle) * (ENV.carW * 0.28);
            const vCenterY = car.y + Math.sin(car.angle) * (ENV.carW * 0.28);
            const carCanvasX = Math.round(vCenterX + mapOffsetX);
            const carCanvasY = Math.round(vCenterY + mapOffsetY);
            const carWorldX = Number(vCenterX.toFixed(2));
            const carWorldY = Number(vCenterY.toFixed(2));
            const boxW = 260, boxH = 44;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(12, 12, boxW, boxH);
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.strokeRect(12, 12, boxW, boxH);
            ctx.fillStyle = '#ffffff'; ctx.font = '12px monospace';
            ctx.fillText(`Car center (canvas): ${carCanvasX}, ${carCanvasY}`, 18, 30);
            ctx.fillText(`Car center (world): ${carWorldX}, ${carWorldY}`, 18, 46);
            ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(carCanvasX - 6, carCanvasY); ctx.lineTo(carCanvasX + 6, carCanvasY);
            ctx.moveTo(carCanvasX, carCanvasY - 6); ctx.lineTo(carCanvasX, carCanvasY + 6); ctx.stroke();
            ctx.lineWidth = 1;
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
                car.x = nextX; car.y = nextY; car.angle = nextAngle;
            }
        }
        updateGuideDots(now);
        const currCorners = getCarCorners();
        const currEdges = getCarEdges(currCorners);
        hitYellow = hasAnyEdgeIntersection(currEdges, yellowLines);
        if (!hitBorder) {
            hitBorder = hasAnyEdgeIntersection(currEdges, borderLines);
        }
        updateParkingMilestones(hitBorder, hitYellow);
        updateHudPosition();
        if (hitBorder) showWarning('XE CHẠM LỀ', '#991b1b');
        else if (hitYellow) showWarning('XE ĐÈ VẠCH', '#ef4444');
        else if (hasExerciseCompleted) showWarning('HOÀN THÀNH BÀI GHÉP XE', '#065f46');
        else if (hasParkingSuccess) showWarning('GHÉP XE THÀNH CÔNG', '#15803d');
        else warningDiv.style.display = 'none';
    }

    function resizeAndOffset() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const minX = ENV.mapLeft;
        const maxX = Math.max(ENV.rightRoadRight, ENV.spotBorderRight);
        const minY = Math.min(ENV.roadTop, ENV.rightRoadTop);
        const maxY = Math.max(ENV.rightRoadBottom, ENV.spotBorderBottom);
        const mapW = maxX - minX, mapH = maxY - minY;
        mapOffsetX = (canvas.width - mapW) / 2 - minX;
        mapOffsetY = (canvas.height - mapH) / 2 - minY;
    }

    function loop(ts) {
        updateGame(ts);
        draw();
        animationId = requestAnimationFrame(loop);
    }

    function refreshParams() {
        CAR_A = parseFloat(sharedDom.cfgCarA.value);
        CAR_B = parseFloat(sharedDom.cfgCarB.value);
        calculateEnvironment();
        resizeAndOffset();
        resetCarPosition();
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
                }

                if (controlMode === 'kb') {
                    const k = e.key.toLowerCase();
                    if (k === 'd') {
                        car.gear = 1;
                        updateGearUI();
                    }
                    if (k === 'r') {
                        car.gear = -1;
                        updateGearUI();
                    }
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

            if (controlMode === 'kb') {
                if (e.key === ' ' || e.code === 'Space') car.isMoving = false;
            }
        };

        const wheel = (e) => {
            if (controlMode === 'hybrid' && !e.target.closest('.modal-backdrop')) {
                car.gear = e.deltaY < 0 ? 1 : -1;
                updateGearUI();
                e.preventDefault();
            }
        };

        const mousedown = (e) => {
            if (controlMode === 'hybrid' && e.button === 0) car.isMoving = true;
        };

        const mouseup = () => {
            if (controlMode === 'hybrid') car.isMoving = false;
        };

        const mouseleaveCanvas = () => {
            if (controlMode === 'hybrid') car.isMoving = false;
        };

        window.addEventListener('keydown', keydown);
        window.addEventListener('keyup', keyup);
        window.addEventListener('wheel', wheel, { passive: false });
        canvas.addEventListener('mousedown', mousedown);

        const rightClick = (e) => {
            if (e.target === canvas) {
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const canvasX = e.clientX - rect.left;
                const canvasY = e.clientY - rect.top;
                const worldX = canvasX - mapOffsetX;
                const worldY = canvasY - mapOffsetY;
                console.log('MOUSE POS:', { canvasX: Math.round(canvasX), canvasY: Math.round(canvasY), worldX: Number(worldX.toFixed(2)), worldY: Number(worldY.toFixed(2)) });
                try { showWarning(`CURSOR: ${Math.round(canvasX)},${Math.round(canvasY)}  MAP:${worldX.toFixed(1)},${worldY.toFixed(1)}`, '#0ea5e9'); } catch (err) {}
            }
        };
        canvas.addEventListener('contextmenu', rightClick);
        window.addEventListener('mouseup', mouseup);
        canvas.addEventListener('mouseleave', mouseleaveCanvas);

        // Kéo thả activation rect (chỉ khi DEBUG_MODE bật và giữ Shift)
        let activationDrag = null;
        const pointDistance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
        const onPointerDown = (e) => {
            if (e.button !== 0) return;
            if (!DEBUG_MODE) return;      // chỉ hoạt động khi debug bật
            if (!e.shiftKey) return;
            const rect = canvas.getBoundingClientRect();
            const canvasX = e.clientX - rect.left;
            const canvasY = e.clientY - rect.top;
            if (!guideDots || !guideDots.length) return;
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
            console.log('Dot' + (idx+1) + ' activationRect (world):', guideDots[idx].activationRect);
            draw();
            e.preventDefault();
        };

        const endPointer = (e) => {
            if (!activationDrag) return;
            const idx = activationDrag.dotIndex;
            if (guideDots[idx] && guideDots[idx].activationRect) {
                console.log('Dot' + (idx+1) + ' final:', guideDots[idx].activationRect);
            }
            activationDrag = null;
        };

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

    calculateEnvironment();
    resetCarPosition();
    updateGearUI();
    updateSteeringUIState();
    resizeAndOffset();
    const removeEvents = setupEvents();
    animationId = requestAnimationFrame(loop);
    window.addEventListener('resize', resizeAndOffset);

    return () => {
        if (animationId) cancelAnimationFrame(animationId);
        if (hudRestoreTimer) clearTimeout(hudRestoreTimer);
        window.removeEventListener('resize', resizeAndOffset);
        removeEvents();
    };
}