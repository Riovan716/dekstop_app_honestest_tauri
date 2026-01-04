import { useCallback, useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export default function CheckReadiness() {
    const webcamRef = useRef(null);
    const canvasRef = useRef(null);
    const [faceLandmarker, setFaceLandmarker] = useState(null);
    const [runningMode, setRunningMode] = useState('IMAGE');
    const [movementDescription, setMovementDescription] = useState('');
    const [banyakOrang, setBanyakOrang] = useState('');

    // Refs for tracking detection state across renders
    const stateRef = useRef({
        lastScreenshotTime: null,
        lastDetection: 0,
        lastRightDetection: 0,
        lastLeftDetection: 0,
        lastTopDetection: 0,
        lastDownDetection: 0,
        lirikKiri: 0,
        lirikKanan: 0,
        lirikBawah: 0,
        lirikAtas: 0
    });

    const createFaceLandmarker = async () => {
        try {
            const filesetResolver = await FilesetResolver.forVisionTasks(
                './mediapipe/wasm'
            );

            const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: './face_landmarker.task',
                    delegate: 'GPU'
                },
                outputFaceBlendshapes: true,
                runningMode: runningMode,
                numFaces: 3
            });
            setFaceLandmarker(landmarker);
        } catch (e) {
            console.error("Failed to load FaceLandmarker:", e);
        }
    };

    const capture = useCallback(() => {
        const now = new Date().getTime();
        if (stateRef.current.lastScreenshotTime == null) {
            stateRef.current.lastScreenshotTime = now;
            const imageSrc = webcamRef.current?.getScreenshot();
            if (imageSrc) {
                // console.log("Captured image:", imageSrc.substring(0, 50) + "..."); 
                // Implement save logic here if needed using Tauri fs
            }
        } else {
            if (now - stateRef.current.lastScreenshotTime > 3000) {
                stateRef.current.lastScreenshotTime = now;
                const imageSrc = webcamRef.current?.getScreenshot();
                if (imageSrc) {
                    // console.log("Captured image:", imageSrc.substring(0, 50) + "...");
                }
            }
        }
    }, [webcamRef]);

    const detectMovement = (faceBlendShapes) => {
        const currentTime = new Date().getTime();
        const categories = faceBlendShapes.categories;
        const state = stateRef.current;

        // Original Right indices (16, 13) -> Now mapped to LEFT
        if (categories[16].score > 0.92 && categories[13].score > 0.92) {
            if (currentTime - state.lastDetection > 500) {
                setMovementDescription('Melirik ke kiri');
                state.lirikKiri += 1;
                state.lirikKanan = 0;
                state.lirikBawah = 0;
                state.lirikAtas = 0;

                if (currentTime - state.lastLeftDetection > 5000) {
                    state.lirikKiri = 0;
                    state.lastLeftDetection = currentTime;
                }

                if (currentTime - state.lastLeftDetection < 5000 && state.lirikKiri >= 3) {
                    capture();
                    state.lirikKiri = 0;
                    state.lastLeftDetection = currentTime;
                }
                state.lastDetection = currentTime;
            }
        }

        // Original Left indices (15, 14) -> Now mapped to RIGHT
        if (categories[15].score > 0.89 && categories[14].score > 0.89) {
            if (currentTime - state.lastDetection > 500) {
                setMovementDescription('Melirik ke kanan');
                state.lirikKanan += 1;
                state.lirikKiri = 0;
                state.lirikBawah = 0;
                state.lirikAtas = 0;

                if (currentTime - state.lastRightDetection > 5000) {
                    state.lirikKanan = 0;
                    state.lastRightDetection = currentTime;
                }

                if (currentTime - state.lastRightDetection < 5000 && state.lirikKanan >= 3) {
                    capture();
                    state.lirikKanan = 0;
                    state.lastRightDetection = currentTime;
                }
                state.lastDetection = currentTime;
            }
        }

        // Original Down indices (11, 12) -> Now mapped to UP
        if (categories[11].score > 0.75 && categories[12].score > 0.75) {
            if (currentTime - state.lastDetection > 500) {
                setMovementDescription('Melirik ke atas');
                state.lirikKanan = 0;
                state.lirikKiri = 0;
                state.lirikAtas += 1;
                state.lirikBawah = 0;

                if (currentTime - state.lastTopDetection > 5000) {
                    state.lirikAtas = 0;
                    state.lastTopDetection = currentTime;
                }

                if (currentTime - state.lastTopDetection < 5000 && state.lirikAtas >= 3) {
                    capture();
                    state.lirikAtas = 0;
                    state.lastTopDetection = currentTime;
                }
                state.lastDetection = currentTime;
            }
        }

        // Original Up indices (17, 18) -> Now mapped to DOWN
        if (categories[17].score > 0.3 && categories[18].score > 0.3) {
            if (currentTime - state.lastDetection > 500) {
                setMovementDescription('Melirik ke bawah');
                state.lirikKanan = 0;
                state.lirikKiri = 0;
                state.lirikBawah += 1;
                state.lirikAtas = 0;

                if (currentTime - state.lastDownDetection > 5000) {
                    state.lirikBawah = 0;
                    state.lastDownDetection = currentTime;
                }

                if (currentTime - state.lastDownDetection < 5000 && state.lirikBawah >= 3) {
                    capture();
                    state.lirikBawah = 0;
                    state.lastDownDetection = currentTime;
                }
                state.lastDetection = currentTime;
            }
        }
    };

    const getBanyakOrangMessage = (count) => {
        if (count > 0 && count < 2) {
            return `Terdeteksi ada ${count} di dalam frame.`;
        } else if (count > 1) {
            capture();
            return `Terdeteksi ada ${count} di dalam frame.`;
        } else {
            capture();
            return 'Tidak ada orang terdeteksi.';
        }
    };

    const predictWebcam = async () => {
        if (!faceLandmarker || !webcamRef.current || !canvasRef.current) return;

        const video = webcamRef.current.video;
        const canvas = canvasRef.current;

        // Ensure video is ready
        if (!video || video.readyState !== 4) return;

        const ctx = canvas.getContext('2d');

        if (runningMode === 'IMAGE') {
            setRunningMode('VIDEO');
            await faceLandmarker.setOptions({ runningMode: 'VIDEO' });
        }

        const processFrame = async () => {
            if (!webcamRef.current || !webcamRef.current.video) return; // check again

            const startTimeMs = performance.now();
            let results;
            try {
                results = faceLandmarker.detectForVideo(video, startTimeMs);
            } catch (e) {
                console.error(e);
                requestAnimationFrame(processFrame);
                return;
            }

            setBanyakOrang(getBanyakOrangMessage(results.faceLandmarks.length));

            if (results.faceLandmarks && ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                results.faceLandmarks.forEach(() => {
                    // Drawing connectors logic can be added here if needed
                    // Currently only blendshapes are used for logic
                    if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
                        detectMovement(results.faceBlendshapes[0]);
                    }
                });
            }
            requestAnimationFrame(processFrame);
        };
        processFrame();
    };

    useEffect(() => {
        createFaceLandmarker();
    }, []);

    useEffect(() => {
        if (faceLandmarker && webcamRef.current) {
            const video = webcamRef.current.video;
            if (video) {
                const onLoadedData = () => {
                    if (canvasRef.current) {
                        canvasRef.current.width = video.videoWidth;
                        canvasRef.current.height = video.videoHeight;
                    }
                    predictWebcam();
                };

                if (video.readyState === 4) {
                    onLoadedData();
                } else {
                    video.addEventListener('loadeddata', onLoadedData);
                }
                return () => {
                    video.removeEventListener('loadeddata', onLoadedData);
                };
            }
        }
    }, [faceLandmarker]);

    return (
        <div className="w-screen h-screen flex items-center flex-col justify-center bg-gray-50">
            <h1 className="text-center font-bold text-3xl mb-5 text-gray-800">Check Readiness</h1>

            <div className="relative mt-5 rounded-xl overflow-hidden shadow-lg">
                <Webcam
                    ref={webcamRef}
                    audio={false}
                    mirrored={true}
                    videoConstraints={{
                        frameRate: { ideal: 15, max: 25 }
                    }}
                    screenshotFormat="image/jpeg"
                    className="object-cover"
                    style={{ width: 640, height: 480 }}
                />
                <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 z-10 -scale-x-100"
                    style={{ width: 640, height: 480 }}
                />

                {/* Placeholder if webcam is loading */}
                {!faceLandmarker && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white">
                        Loading AI Model...
                    </div>
                )}
            </div>

            <div className="border rounded-lg p-5 mt-5 max-w-xl w-full text-center bg-white shadow-sm">
                <h3 className="font-bold text-xl mb-3 text-gray-700">Detection Result</h3>
                <span className="block text-lg text-blue-600 font-semibold">{movementDescription || "Normal"}</span>
                <span className="block mt-2 text-gray-600">{banyakOrang}</span>
            </div>

            <Link
                to="/main"
                className="mt-8 flex items-center px-6 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Main
            </Link>
        </div>
    );
}
