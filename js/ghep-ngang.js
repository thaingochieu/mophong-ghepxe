// Ghép xe ngang
function initGhepNgang(container, sharedDom) {
    const SCALE = 45;
    const COLLISION_FRONT_SCALE = 0.80;
    const COLLISION_REAR_SCALE = 0.72;
    const COLLISION_SIDE_SCALE = 0.72;
    const STEERING_LOCAL_RATIO = { x: 0.22, y: -0.16 };
    const DRIVER_SEAT_LOCAL_RATIO = { x: 0.02, y: -0.20 };

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
        angle: -Math.PI / 2,
        steeringTurns: 0,
        gear: 1,
        isMoving: false
    };
    const keys = { A: false, D: false };
    let steerUIState = 'straight', steerHoldUntilMs = 0, wasInNeutralZone = true;
    let hasParkingSuccess = false, hasExerciseCompleted = false;
    let lastTime = 0, animationId = null;

    const warningDiv = document.createElement('div');
    warningDiv.className = 'warning-overlay';
    warningDiv.style.backgroundColor = '#ef4444';
    warningDiv.innerText = '⚠️ XE ĐÈ VẠCH ⚠️';
    container.appendChild(warningDiv);
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const carImage = sharedDom.carImg;
    const carImageCrop = { sx: 0, sy: 0, sw: 0, sh: 0, ready: false };

    function calculateEnvironment() {
        const Lg_m = (5 * CAR_A) / 3;
        const Rg_m = (5 * CAR_B) / 4;
        ENV.carW = CAR_A * SCALE;
        ENV.carH = CAR_B * SCALE;
        ENV.Lg = Lg_m * SCALE;
        ENV.Rg = Rg_m * SCALE;
        ENV.Lg_m = Lg_m;
        ENV.Rg_m = Rg_m;
        const MARGIN = 18;
        ENV.roadLeft = 100;
        ENV.roadRight = ENV.roadLeft + 180;
        ENV.mapTop = 50;
        ENV.mapBottom = ENV.mapTop + ENV.Lg + 500;
        ENV.chipTop = ENV.mapTop + 200;
        ENV.chipBottom = ENV.chipTop + ENV.Lg;
        ENV.chipLeft = ENV.roadRight;
        ENV.chipRight = ENV.chipLeft + ENV.Rg;
        ENV.borderTop = ENV.chipTop - MARGIN;
        ENV.borderBottom = ENV.chipBottom + MARGIN;
        ENV.borderRight = ENV.chipRight + MARGIN;

        yellowLines = [
            { x1: ENV.chipLeft, y1: ENV.chipTop, x2: ENV.chipRight, y2: ENV.chipTop },
            { x1: ENV.chipRight, y1: ENV.chipTop, x2: ENV.chipRight, y2: ENV.chipBottom },
            { x1: ENV.chipLeft, y1: ENV.chipBottom, x2: ENV.chipRight, y2: ENV.chipBottom }
        ];
        borderLines = [
            { x1: ENV.roadLeft, y1: ENV.mapTop, x2: ENV.roadRight, y2: ENV.mapTop },
            { x1: ENV.roadRight, y1: ENV.mapTop, x2: ENV.roadRight, y2: ENV.borderTop },
            { x1: ENV.roadRight, y1: ENV.borderTop, x2: ENV.borderRight, y2: ENV.borderTop },
            { x1: ENV.borderRight, y1: ENV.borderTop, x2: ENV.borderRight, y2: ENV.borderBottom },
            { x1: ENV.borderRight, y1: ENV.borderBottom, x2: ENV.roadRight, y2: ENV.borderBottom },
            { x1: ENV.roadRight, y1: ENV.borderBottom, x2: ENV.roadRight, y2: ENV.mapBottom },
            { x1: ENV.roadRight, y1: ENV.mapBottom, x2: ENV.roadLeft, y2: ENV.mapBottom },
            { x1: ENV.roadLeft, y1: ENV.mapBottom, x2: ENV.roadLeft, y2: ENV.mapTop }
        ];
    }

    function resetCarPosition() {
        car.x = ENV.roadRight - ENV.carH / 2 - 20;
        car.y = ENV.chipBottom + ENV.carW / 2 + 100;
        car.angle = -Math.PI / 2;
        car.steeringTurns = 0;
        car.isMoving = false;
        hasParkingSuccess = false;
        hasExerciseCompleted = false;
        warningDiv.style.display = 'none';
        updateGearUI();
    }

    function updateGearUI() {
        sharedDom.gearForward.className = 'gear ' + (car.gear === 1 ? 'active-forward' : '');
        sharedDom.gearReverse.className = 'gear ' + (car.gear === -1 ? 'active-reverse' : '');
    }

    function getCarCorners(cx = car.x, cy = car.y, ca = car.angle) {
        const cos = Math.cos(ca), sin = Math.sin(ca);
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

    function isCarOnMainRoad() {
        return car.x >= ENV.roadLeft && car.x <= ENV.roadRight;
    }

    function updateParkingMilestones(hitBorder, hitYellow) {
        if (hitBorder || hitYellow) return;
        const corners = getCarCorners();
        const insideSpot = corners.every(c => c.x >= ENV.chipLeft - 5 && c.x <= ENV.chipRight + 5 && c.y >= ENV.chipTop - 5 && c.y <= ENV.chipBottom + 5);
        const isStraight = Math.abs(Math.cos(car.angle)) < 0.15;
        if (!hasParkingSuccess && insideSpot && isStraight) hasParkingSuccess = true;
        if (hasParkingSuccess && !hasExerciseCompleted && isCarOnMainRoad() && car.y < ENV.chipTop - 20) hasExerciseCompleted = true;
    }

    function updateSteeringUIState(nowMs) {
        const isNeutral = Math.abs(car.steeringTurns) <= 0.05;
        if (isNeutral && !wasInNeutralZone) steerHoldUntilMs = nowMs + 100;
        steerUIState = (isNeutral || nowMs < steerHoldUntilMs) ? 'straight' : (car.steeringTurns < 0 ? 'left' : 'right');
        wasInNeutralZone = isNeutral;
        const absTurn = Math.abs(car.steeringTurns).toFixed(1);
        sharedDom.steeringText.innerText = steerUIState === 'left' ? `Lái trái: ${absTurn}` : (steerUIState === 'right' ? `Lái phải: ${absTurn}` : 'Thẳng lái');
        sharedDom.wheelImg.style.transform = `rotate(${car.steeringTurns * 360}deg)`;
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
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(mapOffsetX, mapOffsetY);
        ctx.beginPath();
        ctx.moveTo(ENV.roadLeft, ENV.mapTop);
        ctx.lineTo(ENV.roadRight, ENV.mapTop);
        ctx.lineTo(ENV.roadRight, ENV.borderTop);
        ctx.lineTo(ENV.borderRight, ENV.borderTop);
        ctx.lineTo(ENV.borderRight, ENV.borderBottom);
        ctx.lineTo(ENV.roadRight, ENV.borderBottom);
        ctx.lineTo(ENV.roadRight, ENV.mapBottom);
        ctx.lineTo(ENV.roadLeft, ENV.mapBottom);
        ctx.closePath();
        ctx.fillStyle = '#64748b'; ctx.fill();
        ctx.lineWidth = 5; ctx.strokeStyle = 'white'; ctx.setLineDash([]); ctx.stroke();
        ctx.strokeStyle = '#ef4444'; ctx.setLineDash([15, 15]); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        yellowLines.forEach(l => { ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); });
        ctx.strokeStyle = '#eab308'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#fde047'; ctx.font = 'bold 12px monospace';
        ctx.fillText(`Lg = ${ENV.Lg_m.toFixed(2)}m`, ENV.borderRight + 12, ENV.chipTop + ENV.Lg / 2);
        ctx.fillText(`Rg = ${ENV.Rg_m.toFixed(2)}m`, ENV.chipLeft + ENV.Rg / 2, ENV.borderBottom + 20);
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
        const mapMinX = ENV.roadLeft;
        const mapMaxX = ENV.borderRight;
        const mapMinY = ENV.mapTop;
        const mapMaxY = ENV.mapBottom;
        const steeringPos = (() => {
            const cos = Math.cos(car.angle), sin = Math.sin(car.angle);
            return {
                x: car.x + (ENV.carW * STEERING_LOCAL_RATIO.x) * cos - (ENV.carH * STEERING_LOCAL_RATIO.y) * sin,
                y: car.y + (ENV.carW * STEERING_LOCAL_RATIO.x) * sin + (ENV.carH * STEERING_LOCAL_RATIO.y) * cos
            };
        })();
        const driverPos = (() => {
            const cos = Math.cos(car.angle), sin = Math.sin(car.angle);
            return {
                x: car.x + (ENV.carW * DRIVER_SEAT_LOCAL_RATIO.x) * cos - (ENV.carH * DRIVER_SEAT_LOCAL_RATIO.y) * sin,
                y: car.y + (ENV.carW * DRIVER_SEAT_LOCAL_RATIO.x) * sin + (ENV.carH * DRIVER_SEAT_LOCAL_RATIO.y) * cos
            };
        })();
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
        if (hitBorder) { warningDiv.innerText = '⚠️ XE CHẠM LỀ ⚠️'; warningDiv.style.backgroundColor = '#991b1b'; warningDiv.style.display = 'block'; }
        else if (hitYellow) { warningDiv.innerText = '⚠️ XE ĐÈ VẠCH ⚠️'; warningDiv.style.backgroundColor = '#ef4444'; warningDiv.style.display = 'block'; }
        else if (hasExerciseCompleted) { warningDiv.innerText = '🎉 HOÀN THÀNH BÀI GHÉP XE 🎉'; warningDiv.style.backgroundColor = '#065f46'; warningDiv.style.display = 'block'; }
        else if (hasParkingSuccess) { warningDiv.innerText = '✅ GHÉP XE THÀNH CÔNG ✅'; warningDiv.style.backgroundColor = '#15803d'; warningDiv.style.display = 'block'; }
        else warningDiv.style.display = 'none';
    }

    function resizeAndOffset() {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        const minX = ENV.roadLeft, maxX = ENV.borderRight;
        const minY = ENV.mapTop, maxY = ENV.mapBottom;
        mapOffsetX = (canvas.width - (maxX - minX)) / 2 - minX;
        mapOffsetY = (canvas.height - (maxY - minY)) / 2 - minY;
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
        const wheel = (e) => { if (!e.target.closest('.dashboard')) { car.gear = e.deltaY < 0 ? 1 : -1; updateGearUI(); e.preventDefault(); } };
        const mousedown = () => { car.isMoving = true; };
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
    resizeAndOffset();
    const removeEvents = setupEvents();
    animationId = requestAnimationFrame(loop);
    window.addEventListener('resize', resizeAndOffset);

    return () => {
        if (animationId) cancelAnimationFrame(animationId);
        window.removeEventListener('resize', resizeAndOffset);
        removeEvents();
        container.innerHTML = '';
    };
}