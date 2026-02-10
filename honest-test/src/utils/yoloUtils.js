import * as ort from "onnxruntime-web";

// Konfigurasi
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";

// Input shape Model Anda (320x320)
const INPUT_SHAPE = [1, 3, 320, 320]; 
const CONF_THRESHOLD = 0.25; 
const IOU_THRESHOLD = 0.45;

export async function loadModel(path) {
    try {
        // Menggunakan opsi fallback CPU jika WebGL bermasalah atau GPU tidak support
        const session = await ort.InferenceSession.create(path, {
            executionProviders: ['webgl', 'wasm'],
            graphOptimizationLevel: 'all'
        });
        return session;
    } catch (e) {
        console.error("Gagal memuat model:", e);
        throw e;
    }
}

export function preprocess(imageSource, modelWidth, modelHeight) {
    const canvas = document.createElement("canvas");
    canvas.width = modelWidth;
    canvas.height = modelHeight;
    const ctx = canvas.getContext("2d");

    // Letterboxing (Isi abu-abu)
    ctx.fillStyle = "#808080"; 
    ctx.fillRect(0, 0, modelWidth, modelHeight);

    const imgWidth = imageSource.videoWidth || imageSource.width;
    const imgHeight = imageSource.videoHeight || imageSource.height;

    const scale = Math.min(modelWidth / imgWidth, modelHeight / imgHeight);
    const newWidth = imgWidth * scale;
    const newHeight = imgHeight * scale;
    const xOffset = (modelWidth - newWidth) / 2;
    const yOffset = (modelHeight - newHeight) / 2;

    ctx.drawImage(imageSource, xOffset, yOffset, newWidth, newHeight);

    const imgData = ctx.getImageData(0, 0, modelWidth, modelHeight);
    const pixels = imgData.data;
    const totalPixels = modelWidth * modelHeight;
    const float32Data = new Float32Array(3 * totalPixels);

    // Normalize 0-255 -> 0.0-1.0
    for (let i = 0; i < totalPixels; i++) {
        float32Data[i] = pixels[i * 4] / 255.0;               // R
        float32Data[i + totalPixels] = pixels[i * 4 + 1] / 255.0; // G
        float32Data[i + 2 * totalPixels] = pixels[i * 4 + 2] / 255.0; // B
    }

    return {
        tensor: new ort.Tensor("float32", float32Data, INPUT_SHAPE),
        scale: scale,
        xOffset: xOffset,
        yOffset: yOffset
    };
}

export async function runInference(session, preprocessedData) {
    const feeds = {};
    const inputName = session.inputNames[0];
    feeds[inputName] = preprocessedData.tensor;
    const results = await session.run(feeds);
    const outputName = session.outputNames[0];
    return results[outputName];
}

export function postprocess(results, imgWidth, imgHeight, params, labels) {
    const output = results.data;
    const dims = results.dims; 
    let boxes = [];
    const { scale, xOffset, yOffset } = params;

    // DETEKSI FORMAT OUTPUT
    // YOLOv5 Standard: [1, Anchors, 5+Classes] -> dims[1] > dims[2] (e.g. 6300 > 14)
    // YOLOv8/Transposed: [1, 4+Classes, Anchors] -> dims[2] > dims[1] (e.g. 6300 > 14)

    // CASE 1: YOLOv5 Standard [1, 6300, 14]
    if (dims[1] > dims[2]) {
        const numAnchors = dims[1]; 
        const numAttribs = dims[2]; 
        const numClasses = numAttribs - 5; // cx,cy,w,h,conf

        for (let i = 0; i < numAnchors; i++) {
            const offset = i * numAttribs;
            const confidence = output[offset + 4]; // Object Confidence

            if (confidence > CONF_THRESHOLD) {
                let maxClassScore = 0;
                let maxClassIndex = -1;
                
                for (let c = 0; c < numClasses; c++) {
                    const classScore = output[offset + 5 + c];
                    if (classScore > maxClassScore) {
                        maxClassScore = classScore;
                        maxClassIndex = c;
                    }
                }

                const finalScore = confidence * maxClassScore;

                if (finalScore > CONF_THRESHOLD) {
                     const cx = output[offset + 0];
                     const cy = output[offset + 1];
                     const w  = output[offset + 2];
                     const h  = output[offset + 3];
                     addBox(cx, cy, w, h, finalScore, maxClassIndex);
                }
            }
        }
    } 
    // CASE 2: YOLOv8 / Transposed [1, 14, 6300]
    else {
        const numAnchors = dims[2];
        const numClasses = dims[1] - 4; 

        for (let i = 0; i < numAnchors; i++) {
            // YOLOv8 usually doesn't have objectness score separately, max class score IS the score.
            let maxScore = 0;
            let maxClass = -1;

            for (let c = 0; c < numClasses; c++) {
                const score = output[(4 + c) * numAnchors + i]; // Reading across rows
                if (score > maxScore) {
                    maxScore = score;
                    maxClass = c;
                }
            }

            if (maxScore > CONF_THRESHOLD) {
                const cx = output[0 * numAnchors + i];
                const cy = output[1 * numAnchors + i];
                const w  = output[2 * numAnchors + i];
                const h  = output[3 * numAnchors + i];
                addBox(cx, cy, w, h, maxScore, maxClass);
            }
        }
    }

    function addBox(cx, cy, w, h, score, classIndex) {
        // Clamp score logic
        if (score > 1.0) score = 1.0; 

        // Undo Letterboxing
        let x = cx - w / 2;
        let y = cy - h / 2;
        x = (x - xOffset) / scale;
        y = (y - yOffset) / scale;
        const width = w / scale;
        const height = h / scale;

        boxes.push({
            label: labels[classIndex] || "unknown",
            score: score,
            box: [x, y, width, height]
        });
    }

    return nms(boxes);
}

function nms(boxes) {
    if (boxes.length === 0) return [];
    boxes.sort((a, b) => b.score - a.score);
    const result = [];
    while (boxes.length > 0) {
        const best = boxes.shift();
        result.push(best);
        boxes = boxes.filter(other => calculateIoU(best.box, other.box) < IOU_THRESHOLD);
    }
    return result;
}

function calculateIoU(boxA, boxB) {
    const x1 = Math.max(boxA[0], boxB[0]);
    const y1 = Math.max(boxA[1], boxB[1]);
    const x2 = Math.min(boxA[0] + boxA[2], boxB[0] + boxB[2]);
    const y2 = Math.min(boxA[1] + boxA[3], boxB[1] + boxB[3]);
    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    const intersection = w * h;
    const areaA = boxA[2] * boxA[3];
    const areaB = boxB[2] * boxB[3];
    return intersection / (areaA + areaB - intersection);
}