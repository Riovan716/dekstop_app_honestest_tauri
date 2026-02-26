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

    const detectMovement = (faceBlendShapes, landmarks) => {
        const currentTime = new Date().getTime();
        const categories = faceBlendShapes.categories;
        const state = stateRef.current;
        let detectedAction = null; // 'left', 'right', 'up', 'down', or null

        if (landmarks) {
            // --- 1. Head Turn (YAW) ---
            const nose = landmarks[1];
            const rightEye = landmarks[33];
            const leftEye = landmarks[263];
            const distNoseToRight = Math.abs(nose.x - rightEye.x);
            const distNoseToLeft = Math.abs(nose.x - leftEye.x);

            let headTurn = 'center';
            if (distNoseToLeft < distNoseToRight * 0.5) {
                headTurn = 'left';
            } else if (distNoseToRight < distNoseToLeft * 0.5) {
                headTurn = 'right';
            }

            // --- 2. Head Pitch (PITCH) - Only if Head is Center ---
            let headPitch = 'center';
            if (headTurn === 'center') {
                const midEyeY = (rightEye.y + leftEye.y) / 2;
                const upperLip = landmarks[13];
                const lowerLip = landmarks[14];
                const midMouthY = (upperLip.y + lowerLip.y) / 2;

                const distEyeNose = Math.abs(nose.y - midEyeY);
                const distNoseMouth = Math.abs(midMouthY - nose.y);

                // Up: Eyes closer to nose (Legacy: 0.85 multiplier)
                if (distEyeNose < distNoseMouth * 0.7) {
                    headPitch = 'up';
                }
                // Down: Mouth closer to nose
                else if (distNoseMouth < distEyeNose * 0.45) {
                    headPitch = 'down';
                }
            }

            // --- 3. Eye Gaze (EYES) ---
            // Sensitive Thresholds
            const isEyesRight = (categories[16].score > 0.75 || categories[13].score > 0.75);
            const isEyesLeft = (categories[15].score > 0.75 || categories[14].score > 0.75);
            const isEyesDown = (categories[11].score > 0.45 || categories[12].score > 0.45);
            const isEyesUp = (categories[17].score > 0.35 || categories[18].score > 0.35);

            // --- 4. Hierarchical Decision ---
            if (headTurn === 'left') {
                detectedAction = 'left';
            } else if (headTurn === 'right') {
                detectedAction = 'right';
            } else {
                // Head is Center (Horizontal) -> Check Vertical with Compensation Logic

                if (headPitch === 'up') {
                    // Head Up + Eyes Down (looking at screen) = Normal
                    if (isEyesDown) {
                        detectedAction = null;
                    } else {
                        detectedAction = 'up';
                    }
                } else if (headPitch === 'down') {
                    // Head Down + Eyes Up (looking at screen) = Normal
                    if (isEyesUp) {
                        detectedAction = null;
                    } else {
                        detectedAction = 'down';
                    }
                } else {
                    // Head Pitch Center -> Rely on Eyes
                    if (isEyesUp) {
                        detectedAction = 'up';
                    } else if (isEyesDown) {
                        detectedAction = 'down';
                    }
                }

                // If no Vertical Action detected, check Horizontal Eyes
                if (!detectedAction) {
                    if (isEyesLeft) {
                        detectedAction = 'left';
                    } else if (isEyesRight) {
                        detectedAction = 'right';
                    }
                }
            }
        }

        // --- 5. Application Logic ---
        if (detectedAction) {
            // Debounce: 200ms for responsiveness
            if (currentTime - state.lastDetection > 200) {

                // Update Description
                if (detectedAction === 'left') setMovementDescription('Melirik ke kiri');
                if (detectedAction === 'right') setMovementDescription('Melirik ke kanan');
                if (detectedAction === 'up') setMovementDescription('Melirik ke atas');
                if (detectedAction === 'down') setMovementDescription('Melirik ke bawah');

                // Update Counters
                // Reset others
                if (detectedAction !== 'left') state.lirikKiri = 0;
                if (detectedAction !== 'right') state.lirikKanan = 0;
                if (detectedAction !== 'up') state.lirikAtas = 0;
                if (detectedAction !== 'down') state.lirikBawah = 0;

                // Increment Current
                if (detectedAction === 'left') state.lirikKiri++;
                if (detectedAction === 'right') state.lirikKanan++;
                if (detectedAction === 'up') state.lirikAtas++;
                if (detectedAction === 'down') state.lirikBawah++;

                // Trigger Capture Logic (Count >= 5 within 5s)
                const checkCapture = (count, lastTimeProp, countProp) => {
                    if (currentTime - state[lastTimeProp] > 5000) {
                        state[countProp] = 1; // Reset to 1 since we just detected
                        state[lastTimeProp] = currentTime;
                    } else if (count >= 5) {
                        capture();
                        state[countProp] = 0;
                        state[lastTimeProp] = currentTime;
                    }
                };

                if (detectedAction === 'left') checkCapture(state.lirikKiri, 'lastLeftDetection', 'lirikKiri');
                if (detectedAction === 'right') checkCapture(state.lirikKanan, 'lastRightDetection', 'lirikKanan');
                if (detectedAction === 'up') checkCapture(state.lirikAtas, 'lastTopDetection', 'lirikAtas');
                if (detectedAction === 'down') checkCapture(state.lirikBawah, 'lastDownDetection', 'lirikBawah');

                state.lastDetection = currentTime;
            }
        } else {
            // No movement
            setMovementDescription('');
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

        let lastVideoTime = -1;
        let lastProcessTime = -1;

        const processFrame = async () => {
            if (!webcamRef.current || !webcamRef.current.video) return;

            const now = performance.now();
            // Throttle: only process every ~150ms (approx 6-7 FPS)
            if (now - lastProcessTime < 150) {
                requestAnimationFrame(processFrame);
                return;
            }
            lastProcessTime = now;

            const startTimeMs = performance.now();

            // Only detect if video time has advanced
            if (video.currentTime !== lastVideoTime) {
                lastVideoTime = video.currentTime;

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
                        if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
                            detectMovement(results.faceBlendshapes[0], results.faceLandmarks ? results.faceLandmarks[0] : null);
                        }
                    });
                }
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
        <div className="w-screen flex flex-col items-center justify-center bg-gray-50 p-4 gap-4" style={{ height: '100dvh', overflow: 'hidden' }}>
            <h1 className="text-center font-bold text-2xl md:text-3xl text-gray-800 shrink-0">Check Readiness</h1>

            <div className="relative w-full max-w-[640px] aspect-[4/3] max-h-[45vh] rounded-xl overflow-hidden shadow-lg shrink min-h-0 bg-black">
                <Webcam
                    ref={webcamRef}
                    audio={false}
                    mirrored={true}
                    videoConstraints={{
                        frameRate: { ideal: 15, max: 25 }
                    }}
                    screenshotFormat="image/jpeg"
                    className="w-full h-full object-contain"
                />
                <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 w-full h-full object-contain -scale-x-100"
                />

                {/* Placeholder if webcam is loading */}
                {!faceLandmarker && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white">
                        Loading AI Model...
                    </div>
                )}
            </div>

            <div className="border rounded-lg p-4 max-w-xl w-full text-center bg-white shadow-sm shrink-0">
                <h3 className="font-bold text-lg mb-2 text-gray-700">Detection Result</h3>
                <span className="block text-lg text-blue-600 font-semibold">{movementDescription || "Normal"}</span>
                <span className="block mt-1 text-gray-600 text-sm">{banyakOrang}</span>
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
