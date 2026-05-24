// Ghép xe dọc (lùi chuồng)
function initGhepDoc(sharedDom, options = {}) {
    const SCALE = 45;
    const PARKING_CLEARANCE_LENGTH_M = 0.6;
    const PARKING_CLEARANCE_WIDTH_M = 0.6;
    const RIGHT_ROAD_EXTRA_DEPTH_PX = 350;
    const SPOT_BOTTOM_GAP_PX = 28;

    function buildEnvironment(CAR_A, CAR_B, SCALE) {
        const Ld_m = CAR_A + PARKING_CLEARANCE_LENGTH_M;
        const Rd_m = CAR_B + PARKING_CLEARANCE_WIDTH_M;
        const Ed_m = 1.2 * CAR_A;
        const ENV = {
            carW: CAR_A * SCALE,
            carH: CAR_B * SCALE,
            Ld: Ld_m * SCALE,
            Rd: Rd_m * SCALE,
            Ed: Ed_m * SCALE,
            Ld_m, Rd_m, Ed_m
        };
        const MARGIN = 10;
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
        return ENV;
    }

    function getYellowLines(ENV) {
        const MARGIN = 10;
        const EXTEND = 50;
        const yLineTop = ENV.roadTop + MARGIN;          // Đường vàng phía trên
        const yLineMouth = ENV.roadBottom - MARGIN;     // Đường vàng phía dưới (miệng chuồng)

        return [
            // 1. Vạch vàng chạy dọc theo lề trên (từ trái sang phải)
            { x1: ENV.mapLeft + MARGIN, y1: yLineTop, x2: ENV.chipRight + EXTEND, y2: yLineTop },

            // 2. Vạch vàng phía dưới – đoạn bên trái miệng chuồng
            { x1: ENV.chipLeft - EXTEND, y1: yLineMouth, x2: ENV.chipLeft, y2: yLineMouth },

            // 3. Chữ U của ô đỗ (cạnh trái)
            { x1: ENV.chipLeft, y1: yLineMouth, x2: ENV.chipLeft, y2: ENV.chipBottom },
            // 4. Chữ U – cạnh dưới
            { x1: ENV.chipLeft, y1: ENV.chipBottom, x2: ENV.chipRight, y2: ENV.chipBottom },
            // 5. Chữ U – cạnh phải
            { x1: ENV.chipRight, y1: ENV.chipBottom, x2: ENV.chipRight, y2: yLineMouth },

            // 6. Vạch vàng phía dưới – đoạn bên phải miệng chuồng
            { x1: ENV.chipRight, y1: yLineMouth, x2: ENV.chipRight + EXTEND, y2: yLineMouth }
        ];
    }

    function getBorderLines(ENV) {
        return [
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

    function getGuideDots(ENV) {
        return [
            {
                x: ENV.mapLeft,
                y: ENV.roadBottom - ENV.Ed * 0.15,
                activationRect: { minX: 450, minY: 350, maxX: 650, maxY: 550 },
                active: false, blinkPhase: 0, lastToggle: 0
            },
            {
                x: ENV.chipLeft + ENV.Rd * 0.5,
                y: ENV.chipBottom - ENV.Ld * -0.06,
                activationRect: { minX: 330, minY: 400, maxX: 430, maxY: 550 },
                active: false, blinkPhase: 0, lastToggle: 0
            },
            {
                x: ENV.chipLeft + ENV.Rd * 1.09,
                y: ENV.chipBottom - ENV.Ld * 0.8,
                activationRect: { minX: 225, minY: 350, maxX: 320, maxY: 470 },
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

    function checkParkingSuccess(car, ENV, SCALE) {
        const inSpot = (car.x >= ENV.spotBorderLeft && car.x <= ENV.spotBorderRight && car.y >= ENV.roadBottom && car.y <= ENV.spotBorderBottom);
        if (!inSpot) return false;
        const corners = getCarCorners(car, ENV);
        const d1 = pointToSegmentDistance(corners[3].x, corners[3].y, ENV.chipLeft, ENV.chipBottom, ENV.chipRight, ENV.chipBottom);
        const d2 = pointToSegmentDistance(corners[2].x, corners[2].y, ENV.chipLeft, ENV.chipBottom, ENV.chipRight, ENV.chipBottom);
        const minDistM = Math.min(d1, d2) / SCALE;
        return minDistM >= 0.1 && minDistM <= 0.3;
    }

    function checkExerciseCompleted(car, ENV) {
        const marginX = ENV.carH * 0.35, marginY = ENV.carW * 0.35;
        return car.x >= ENV.rightRoadLeft + marginX && car.x <= ENV.rightRoadRight - marginX &&
            car.y >= ENV.rightRoadTop + marginY && car.y <= ENV.rightRoadBottom - marginY;
    }

    const tempEnv = buildEnvironment(parseFloat(sharedDom.cfgCarA.value), parseFloat(sharedDom.cfgCarB.value), SCALE);
    const initialCarState = {
        x: tempEnv.rightRoadLeft + (tempEnv.Ed / 2),
        y: tempEnv.rightRoadTop + (tempEnv.carW / 2),
        angle: Math.PI / 2
    };

    return window.GameUtils.createParkingGame({
        mode: 'doc',
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