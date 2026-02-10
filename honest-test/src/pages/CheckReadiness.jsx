import { useCallback, useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { loadModel, preprocess, runInference, postprocess } from '../utils/yoloUtils';

const YOLO_LABELS = ['UL', 'UM', 'UR', 'ML', 'P', 'MR', 'LL', 'LM', 'LR'];

export default function CheckReadiness() {
    const webcamRef = useRef(null);
    const canvasRef = useRef(null);
    const [yoloSession, setYoloSession] = useState(null);
    const [movementDescription, setMovementDescription] = useState('Memuat Model AI...');
    const [banyakOrang, setBanyakOrang] = useState('');
    const requestRef = useRef(null);

    // --- YOLO PREDICTION LOOP ---
    const predictWebcam = useCallback(async () => {
        if (!yoloSession || !webcamRef.current || !canvasRef.current) return;

        const video = webcamRef.current.video;
        const canvas = canvasRef.current;

        if (video.readyState !== 4) {
            requestRef.current = requestAnimationFrame(predictWebcam);
            return;
        }

        const ctx = canvas.getContext('2d');
        
        try {
            // 1. Preprocess
            const processed = preprocess(video, 320, 320);
            
            // 2. Inference
            const outputs = await runInference(yoloSession, processed);
            
            // 3. Postprocess
            const yoloResults = postprocess(outputs, video.videoWidth, video.videoHeight, processed, YOLO_LABELS);

            // 4. Update UI & Logic
            if (yoloResults.length > 0) {
                 // Sort by score descending
                 yoloResults.sort((a,b) => b.score - a.score);
                 const best = yoloResults[0];

                 if (best.label === 'P') {
                     setMovementDescription('Fokus (Normal)');
                 } else {
                     // Mapping label ke teks bahasa Indonesia
                     const mapDir = {
                         'UL': 'Melirik Kiri Atas', 'UM': 'Melirik Atas', 'UR': 'Melirik Kanan Atas',
                         'ML': 'Melirik Kiri',      'MR': 'Melirik Kanan',
                         'LL': 'Melirik Kiri Bawah','LM': 'Melirik Bawah','LR': 'Melirik Kanan Bawah'
                     };
                     setMovementDescription(mapDir[best.label] || `Terdeteksi: ${best.label}`);
                 }
                 setBanyakOrang(`Confidence: ${Math.round(best.score * 100)}%`);
            } else {
                setMovementDescription('Mata Tidak Terdeteksi');
                setBanyakOrang('');
            }

            // 5. Draw to Canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            yoloResults.forEach(pred => {
                const [x, y, w, h] = pred.box;
                const label = pred.label;
                
                // Merah jika bukan 'P' (Pusat)
                const isDanger = label !== 'P'; 
                const color = isDanger ? "#FF0000" : "#00FF00";

                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, w, h);
                
                // Draw Label Background
                ctx.fillStyle = color;
                const text = `${label} ${Math.round(pred.score * 100)}%`;
                const textWidth = ctx.measureText(text).width;
                ctx.fillRect(x, y - 25, textWidth + 10, 25);
                
                // Draw Label Text
                ctx.fillStyle = "#FFFFFF";
                ctx.font = "16px sans-serif";
                ctx.fillText(text, x + 5, y - 7);
            });

        } catch (e) {
            console.error("YOLO inference error:", e);
        }

        requestRef.current = requestAnimationFrame(predictWebcam);
    }, [yoloSession]);

    // Cleanup loop on unmount
    useEffect(() => {
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, []);

    // Load Model
    useEffect(() => {
        const initYolo = async () => {
            try {
                const modelPath = '/yolo/best.onnx'; 
                console.log("Loading YOLO model from:", modelPath);
                const session = await loadModel(modelPath);
                setYoloSession(session);
                setMovementDescription("Siap. Hadapkan wajah ke kamera.");
                console.log("YOLO Model Loaded Successfully!");
            } catch (err) {
                console.error("Failed to load YOLO Model:", err);
                setMovementDescription("Error: Gagal memuat model.");
            }
        };
        initYolo();
    }, []);

    // Trigger loop when session + video ready
    useEffect(() => {
        if (yoloSession && webcamRef.current) {
             const video = webcamRef.current.video;
             if (video) {
                 const onLoaded = () => {
                     if (canvasRef.current) {
                         canvasRef.current.width = video.videoWidth;
                         canvasRef.current.height = video.videoHeight;
                     }
                     predictWebcam();
                 };
                 
                 if (video.readyState === 4) {
                     onLoaded();
                 } else {
                     video.addEventListener('loadeddata', onLoaded);
                 }
             }
        }
    }, [yoloSession, predictWebcam]);

    return (
        <div className="w-screen flex flex-col items-center justify-center bg-gray-50 p-4 gap-4" style={{ height: '100dvh', overflow: 'hidden' }}>
            <h1 className="text-center font-bold text-2xl md:text-3xl text-gray-800 shrink-0">Check Readiness</h1>

            <div className="relative w-full max-w-[800px] aspect-video max-h-[60vh] rounded-xl overflow-hidden shadow-lg shrink min-h-0 bg-black">
                <Webcam
                    ref={webcamRef}
                    audio={false}
                    mirrored={true}
                    videoConstraints={{
                        facingMode: "user",
                        aspectRatio: 1.777777778, // 16:9
                        frameRate: { ideal: 30, max: 60 }
                    }}
                    screenshotFormat="image/jpeg"
                    className="w-full h-full object-contain"
                />
                <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 w-full h-full object-contain -scale-x-100"
                />

                {!yoloSession && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 text-white flex-col">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mb-4"></div>
                        <span>Memuat Model AI...</span>
                    </div>
                )}
            </div>

            <div className="border rounded-lg p-4 max-w-xl w-full text-center bg-white shadow-sm shrink-0">
                <h3 className="font-bold text-lg mb-2 text-gray-700">Detection Result</h3>
                <span className={`block text-2xl font-bold ${movementDescription.includes('Fokus') || movementDescription.includes('Siap') ? 'text-green-600' : 'text-red-500'}`}>
                    {movementDescription}
                </span>
                <span className="block mt-1 text-gray-500 text-sm font-mono">{banyakOrang}</span>
            </div>

            <Link
                to="/main"
                className="flex items-center px-6 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors shrink-0 mb-8"
            >
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Main
            </Link>
        </div>
    );
}
