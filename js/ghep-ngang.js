// Ghép xe ngang (đỗ song song)
function initGhepNgang(sharedDom, options = {}) {
    const SCALE = 45;

    function buildEnvironment(CAR_A, CAR_B, SCALE) {
        const Lg_m = (5 * CAR_A) / 3;
        const Rg_m = (5 * CAR_B) / 4;
        const ENV = {
            carW: CAR_A * SCALE,
            carH: CAR_B * SCALE,
            Lg: Lg_m * SCALE,
            Rg: Rg_m * SCALE,
            Lg_m: Lg_m,
            Rg_m: Rg_m
        };
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
        return ENV;
    }

    function getYellowLines(ENV) {
        return [
            { x1: ENV.chipLeft, y1: ENV.chipTop, x2: ENV.chipRight, y2: ENV.chipTop },
            { x1: ENV.chipRight, y1: ENV.chipTop, x2: ENV.chipRight, y2: ENV.chipBottom },
            { x1: ENV.chipLeft, y1: ENV.chipBottom, x2: ENV.chipRight, y2: ENV.chipBottom }
        ];
    }

    function getBorderLines(ENV) {
        return [
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

    function getGuideDots(ENV) {
        return [
            {
                x: ENV.roadLeft + (ENV.roadRight - ENV.roadLeft) * 0.56,
                y: ENV.mapTop + 22,
                activationRect: { minX: 140, minY: 400, maxX: 250, maxY: 840 },
                active: false, blinkPhase: 0, lastToggle: 0
            },
            {
                x: ENV.borderRight + 100,
                y: ENV.borderTop - 50,
                activationRect: { minX: 100, minY: 150, maxX: 270, maxY: 350 },
                active: false, blinkPhase: 0, lastToggle: 0
            },
            {
                x: ENV.borderRight + 100,
                y: ENV.chipTop + ENV.Lg * 0.75,
                activationRect: { minX: 300, minY: 300, maxX: 400, maxY: 550 },
                active: false, blinkPhase: 0, lastToggle: 0
            },
            {
                x: ENV.borderRight + 100,
                y: ENV.borderBottom - 15,
                activationRect: { minX: 210, minY: 230, maxX: 360, maxY: 390 },
                active: false, blinkPhase: 0, lastToggle: 0
            }
        ];
    }

    function getCarCorners(car, ENV) {
        const cos = Math.cos(car.angle), sin = Math.sin(car.angle);
        const front = ENV.carW * 0.78 * 0.80;
        const rear = ENV.carW * 0.22 * 0.72;
        const halfSide = (ENV.carH / 2) * 0.72;
        return [
            { x: car.x + front*cos - halfSide*sin, y: car.y + front*sin + halfSide*cos },
            { x: car.x + front*cos + halfSide*sin, y: car.y + front*sin - halfSide*cos },
            { x: car.x - rear*cos + halfSide*sin, y: car.y - rear*sin - halfSide*cos },
            { x: car.x - rear*cos - halfSide*sin, y: car.y - rear*sin + halfSide*cos }
        ];
    }

    function checkParkingSuccess(car, ENV, SCALE) {
        const corners = getCarCorners(car, ENV);
        const insideSpot = corners.every(c => c.x >= ENV.chipLeft - 5 && c.x <= ENV.chipRight + 5 && c.y >= ENV.chipTop - 5 && c.y <= ENV.chipBottom + 5);
        const isStraight = Math.abs(Math.cos(car.angle)) < 0.15;
        const rearY = Math.max(corners[2].y, corners[3].y);
        const rearLineGapM = (ENV.chipBottom - rearY) / SCALE;
        const passedChipSlightly = rearLineGapM >= 0.1 && rearLineGapM <= 0.3;
        return insideSpot && isStraight && car.gear === -1 && passedChipSlightly;
    }

    function checkExerciseCompleted(car, ENV) {
        const isOnMainRoad = car.x >= ENV.roadLeft && car.x <= ENV.roadRight;
        return isOnMainRoad && car.y < ENV.chipTop - 20;
    }

    const tempEnv = buildEnvironment(parseFloat(sharedDom.cfgCarA.value), parseFloat(sharedDom.cfgCarB.value), SCALE);
    const initialCarState = {
        x: tempEnv.roadRight - tempEnv.carH / 2 - 20,
        y: tempEnv.mapBottom - (tempEnv.carW * 0.22),
        angle: -Math.PI / 2
    };

    return window.GameUtils.createParkingGame({
        mode: 'ngang',
        sharedDom,
        options,
        buildEnvironment,
        getYellowLines,
        getBorderLines,
        getGuideDots,
        checkParkingSuccess,
        checkExerciseCompleted,
        initialCarState
    });
}