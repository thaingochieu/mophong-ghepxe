// Ghép xe dọc
function initGhepDoc(sharedDom, options = {}) {
    const SCALE = 45;
    const PARKING_CLEARANCE_LENGTH_M = 0.6;
    const PARKING_CLEARANCE_WIDTH_M = 0.6;
    const COLLISION_FRONT_SCALE = 0.80;
    const COLLISION_REAR_SCALE = 0.72;
    const COLLISION_SIDE_SCALE = 0.72;
    const STEERING_LOCAL_RATIO = { x: 0.22, y: -0.16 };
    const DRIVER_SEAT_LOCAL_RATIO = { x: 0.02, y: -0.20 };
    const HUD_DASH_OPACITY_NORMAL = 0.92;
    const HUD_DASH_OPACITY_OVERLAP = 0.18;
    const HUD_RESTORE_DELAY_MS = 250;

    // ===== CẤU HÌNH HIỂN THỊ =====
    let showDimensions = options.showDimensions !== undefined ? options.showDimensions : true;
    let wheelOpacity = options.wheelOpacity !== undefined ? Number(options.wheelOpacity) : 0.22;
    let dashOpacity = options.dashOpacity !== undefined ? Number(options.dashOpacity) : 0.92;
    // Lưu để module có thể cập nhật từ index.html
    window._currentGameModule = {
        showDimensions,
        setShowDimensions: (val) => { 
            // ...existing code...
            showDimensions = val; 
            // Vẽ lại ngay để cập nhật text
            draw();
        },
        setWheelOpacity: (val) => {
            wheelOpacity = Math.min(1, Math.max(0, Number(val)));
            document.documentElement.style.setProperty('--wheel-opacity', String(wheelOpacity));
        },
        setDashOpacity: (val) => {
            dashOpacity = Math.min(1, Math.max(0, Number(val)));
            document.documentElement.style.setProperty('--dash-opacity', String(dashOpacity));
            applyHudDashOpacity(isHudOverlapped);
        }
    };
    // ...existing code...
    document.documentElement.style.setProperty('--wheel-opacity', String(wheelOpacity));
    document.documentElement.style.setProperty('--dash-opacity', String(dashOpacity));

    // Sử dụng canvas có sẵn từ DOM
    const canvas = sharedDom.canvas;
    const ctx = canvas.getContext('2d');
    const warningDiv = sharedDom.warningMsg;
    const carImage = sharedDom.carImg;

    // Đảm bảo có thể dùng hàm từ common.js (dự phòng)
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
    let hasParkingSuccess = false, hasExerciseCompleted = false;
    let lastTime = 0, animationId = null;
    let hudRect = null;
    let isHudOverlapped = false;
    let hudRestoreTimer = null;

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
        ENV.roadBottom = ENV.roadTop + ENV.Ed;
        ENV.spotBorderLeft = ENV.mapLeft + ENV.Ed + 20;
        ENV.chipTop = ENV.roadBottom + MARGIN;
        ENV.chipBottom = ENV.chipTop + ENV.Ld;
        ENV.chipLeft = ENV.spotBorderLeft + MARGIN;
        ENV.chipRight = ENV.chipLeft + ENV.Rd;
        ENV.spotBorderRight = ENV.chipRight + MARGIN;
        ENV.spotBorderBottom = ENV.chipBottom + MARGIN;
        ENV.rightRoadLeft = ENV.spotBorderRight + ENV.Ed;
        ENV.rightRoadRight = ENV.rightRoadLeft + ENV.Ed;
        ENV.rightRoadTop = 40;
        ENV.rightRoadBottom = ENV.roadBottom + 120;

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
    }

    function resetCarPosition() {
        car.x = ENV.rightRoadLeft + (ENV.Ed / 2);
        car.y = ENV.rightRoadTop + (ENV.carW / 2) + 20;
        car.angle = Math.PI / 2;
        car.steeringTurns = 0;
        car.isMoving = false;
        hasParkingSuccess = false;
        hasExerciseCompleted = false;
        warningDiv.style.display = 'none';
        updateGearUI();
    }

    function updateGearUI() {
        // Cập nhật hiển thị số trên bảng điều khiển trung tâm
        if (car.gear === 1) sharedDom.gearDisplay.innerText = "TIẾN";
        else sharedDom.gearDisplay.innerText = "LÙI";
    }

    function refreshHudRect() {
        if (!sharedDom.wheelCenterDash) return;
        hudRect = sharedDom.wheelCenterDash.getBoundingClientRect();
    }

    function applyHudDashOpacity(isOverlapped) {
        if (!sharedDom.wheelCenterDash) return;
        const overlapOpacity = Math.min(dashOpacity, HUD_DASH_OPACITY_OVERLAP);
        sharedDom.wheelCenterDash.style.opacity = isOverlapped ? String(overlapOpacity) : String(dashOpacity);
    }

    function setHudOverlapState(isOverlapped) {
        if (isOverlapped) {
            if (hudRestoreTimer) {
                clearTimeout(hudRestoreTimer);
                hudRestoreTimer = null;
            }
            if (!isHudOverlapped) {
                isHudOverlapped = true;
                applyHudDashOpacity(true);
            }
            return;
        }
        if (!isHudOverlapped) return;
        if (!hudRestoreTimer) {
            hudRestoreTimer = setTimeout(() => {
                isHudOverlapped = false;
                applyHudDashOpacity(false);
                hudRestoreTimer = null;
            }, HUD_RESTORE_DELAY_MS);
        }
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

    function getCarCorners(cx = car.x, cy = car.y, cangle = car.angle) {
        const cos = Math.cos(cangle), sin = Math.sin(cangle);
        const front = (ENV.carW / 2) * COLLISION_FRONT_SCALE;
        const rear = (ENV.carW / 2) * COLLISION_REAR_SCALE;
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

    function updateSteeringUIState(nowMs) {
        const neutralThreshold = 0.05;
        const displayTurns = Math.abs(car.steeringTurns) <= neutralThreshold ? 0 : car.steeringTurns;
        const turnsAbs = Math.abs(displayTurns).toFixed(2);
        if (displayTurns < 0) sharedDom.steerDisplay.innerText = `Lái trái: ${turnsAbs}`;
        else if (displayTurns > 0) sharedDom.steerDisplay.innerText = `Lái phải: ${turnsAbs}`;
        else sharedDom.steerDisplay.innerText = `Thẳng lái: 0.00`;
        sharedDom.wheelImg.style.transform = `rotate(${displayTurns * 360}deg)`;
    }

    function prepareCarImageCrop() {
        if (!carImage.complete || carImage.naturalWidth <= 0 || carImageCrop.ready) return;
        const w = carImage.naturalWidth, h = carImage.naturalHeight;
        const offCanvas = new OffscreenCanvas(w, h);
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(carImage, 0, 0);
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
            carImageCrop.sx = minX; carImageCrop.sy = minY;
            carImageCrop.sw = maxX - minX + 1; carImageCrop.sh = maxY - minY + 1;
        } else {
            carImageCrop.sx = 0; carImageCrop.sy = 0;
            carImageCrop.sw = w; carImageCrop.sh = h;
        }
        carImageCrop.ready = true;
    }

    function draw() {
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Vẽ map
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
        // Chú thích kích thước (bật/tắt theo config)
        // ...existing code...
        if (showDimensions) {
            // ...existing code...
            ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 12px monospace';
            ctx.fillText(`Ed = ${ENV.Ed_m.toFixed(2)}m`, ENV.mapLeft + 50, ENV.roadBottom + 20);
            ctx.save(); ctx.translate(ENV.rightRoadLeft - 15, ENV.roadTop - 40); ctx.rotate(-Math.PI/2); ctx.fillText(`Ed = ${ENV.Ed_m.toFixed(2)}m`, 0, 0); ctx.restore();
            ctx.fillStyle = '#fde047'; ctx.fillText(`Ld = ${ENV.Ld_m.toFixed(2)}m`, ENV.spotBorderRight + 15, ENV.chipTop + ENV.Ld/2);
            ctx.fillText(`Rd = ${ENV.Rd_m.toFixed(2)}m`, ENV.chipLeft + ENV.Rd/2, ENV.spotBorderBottom + 20);
        }
        // Xe
        ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
        if (carImage.complete && carImage.naturalWidth) {
            prepareCarImageCrop();
            if (carImageCrop.ready) {
                ctx.drawImage(carImage, carImageCrop.sx, carImageCrop.sy, carImageCrop.sw, carImageCrop.sh, -ENV.carW/2, -ENV.carH/2, ENV.carW, ENV.carH);
            }
        } else {
            ctx.fillStyle = 'red'; ctx.fillRect(-ENV.carW/2, -ENV.carH/2, ENV.carW, ENV.carH);
        }
        ctx.restore();

        // Đường căn kéo dài hết biên
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

        ctx.restore();
    }

    function updateGame(now) {
        const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
        lastTime = now;
        let steerDelta = GAME_CONFIG.steerSpeed * dt;
        if (keys.A) car.steeringTurns -= steerDelta;
        if (keys.D) car.steeringTurns += steerDelta;
        car.steeringTurns = Math.min(GAME_CONFIG.maxSteerTurns, Math.max(-GAME_CONFIG.maxSteerTurns, car.steeringTurns));
        updateSteeringUIState(now);

        let hitBorder = false, hitYellow = false;
        if (car.isMoving && car.gear !== 0) {
            const wheelAngle = (car.steeringTurns / GAME_CONFIG.maxSteerTurns) * GAME_CONFIG.maxSteerAngleRad;
            const vel = GAME_CONFIG.moveSpeed * 60 * dt * car.gear;
            const nextX = car.x + Math.cos(car.angle) * vel;
            const nextY = car.y + Math.sin(car.angle) * vel;
            const nextAngle = car.angle + (vel / (ENV.carW * 0.6)) * Math.tan(wheelAngle);
            const nextCorners = getCarCorners(nextX, nextY, nextAngle);
            const edges = [[nextCorners[0], nextCorners[1]], [nextCorners[1], nextCorners[2]], [nextCorners[2], nextCorners[3]], [nextCorners[3], nextCorners[0]]];
            for (let e of edges) {
                for (let l of borderLines) {
                    if (linesIntersect(e[0].x, e[0].y, e[1].x, e[1].y, l.x1, l.y1, l.x2, l.y2)) { hitBorder = true; break; }
                }
                if (hitBorder) break;
            }
            if (!hitBorder) {
                car.x = nextX; car.y = nextY; car.angle = nextAngle;
            }
        }
        const currCorners = getCarCorners();
        const currEdges = [[currCorners[0], currCorners[1]], [currCorners[1], currCorners[2]], [currCorners[2], currCorners[3]], [currCorners[3], currCorners[0]]];
        for (let e of currEdges) {
            for (let l of yellowLines) {
                if (linesIntersect(e[0].x, e[0].y, e[1].x, e[1].y, l.x1, l.y1, l.x2, l.y2)) { hitYellow = true; break; }
            }
            if (hitYellow) break;
        }
        if (!hitBorder) {
            for (let e of currEdges) {
                for (let l of borderLines) {
                    if (linesIntersect(e[0].x, e[0].y, e[1].x, e[1].y, l.x1, l.y1, l.x2, l.y2)) { hitBorder = true; break; }
                }
                if (hitBorder) break;
            }
        }
        updateParkingMilestones(hitBorder, hitYellow);
        updateHudOcclusion();
        if (hitBorder) { warningDiv.innerText = '⚠️ XE CHẠM LỀ ⚠️'; warningDiv.style.backgroundColor = '#991b1b'; warningDiv.style.display = 'block'; }
        else if (hitYellow) { warningDiv.innerText = '⚠️ XE ĐÈ VẠCH ⚠️'; warningDiv.style.backgroundColor = '#ef4444'; warningDiv.style.display = 'block'; }
        else if (hasExerciseCompleted) { warningDiv.innerText = 'HOÀN THÀNH BÀI GHÉP XE'; warningDiv.style.backgroundColor = '#065f46'; warningDiv.style.display = 'block'; }
        else if (hasParkingSuccess) { warningDiv.innerText = 'GHÉP XE THÀNH CÔNG'; warningDiv.style.backgroundColor = '#15803d'; warningDiv.style.display = 'block'; }
        else warningDiv.style.display = 'none';
    }

    function resizeAndOffset() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        // ------------------------- ĐIỀU CHỈNH KÍCH THƯỚC MAP -------------------------
        // Muốn thay đổi cách căn chỉnh map, sửa các dòng dưới đây:
        // - mapOffsetX: căn giữa theo chiều ngang (có thể thay đổi để lệch trái/phải)
        // - mapOffsetY: căn giữa theo chiều dọc. Bỏ /2 để dính sát mép trên.
        const minX = ENV.mapLeft;
        const maxX = Math.max(ENV.rightRoadRight, ENV.spotBorderRight);
        const minY = Math.min(ENV.roadTop, ENV.rightRoadTop);
        const maxY = Math.max(ENV.rightRoadBottom, ENV.spotBorderBottom);
        const mapW = maxX - minX, mapH = maxY - minY;
        // Căn giữa chiều ngang (tự động)
        mapOffsetX = (canvas.width - mapW) / 2 - minX;
        // Căn giữa chiều dọc (nếu muốn stretch full, dùng (canvas.height - mapH) / 2 - minY)
        // Hiện tại đang căn giữa dọc. Để dính sát trên, thay bằng: mapOffsetY = -minY;
        // Để dính sát dưới: mapOffsetY = canvas.height - mapH - minY;
        mapOffsetY = (canvas.height - mapH) / 2 - minY;
        refreshHudRect();
        // ----------------------------------------------------------------------------
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
        const keydown = (e) => { if (e.target.tagName !== 'INPUT') { if (e.key === 'a') keys.A = true; if (e.key === 'd') keys.D = true; } };
        const keyup = (e) => { if (e.key === 'a') keys.A = false; if (e.key === 'd') keys.D = false; };
        const wheel = (e) => { if (!e.target.closest('.modal-backdrop')) { car.gear = e.deltaY < 0 ? 1 : -1; updateGearUI(); e.preventDefault(); } };
        const mousedown = (e) => { if (e.button === 0) car.isMoving = true; };
        const mouseup = () => { car.isMoving = false; };
        const mouseleaveCanvas = () => { car.isMoving = false; };
        window.addEventListener('keydown', keydown);
        window.addEventListener('keyup', keyup);
        window.addEventListener('wheel', wheel, { passive: false });
        canvas.addEventListener('mousedown', mousedown);
        window.addEventListener('mouseup', mouseup);
        canvas.addEventListener('mouseleave', mouseleaveCanvas);
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
            window.removeEventListener('mouseup', mouseup);
            canvas.removeEventListener('mouseleave', mouseleaveCanvas);
        };
    }

    calculateEnvironment();
    resetCarPosition();
    applyHudDashOpacity(false);
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