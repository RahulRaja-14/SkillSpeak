import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, CameraOff, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

interface WebcamFeedProps {
  isActive: boolean;
  onBehaviorUpdate?: (score: number, messages: string[]) => void;
  className?: string;
}

export function WebcamFeed({ 
  isActive, 
  onBehaviorUpdate, 
  className 
}: WebcamFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // MediaPipe references
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const animationFrameRef = useRef<number>(0);

  const initModel = useCallback(async () => {
    if (faceLandmarkerRef.current) return;
    setIsAiLoading(true);
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });
      faceLandmarkerRef.current = landmarker;
    } catch (err) {
      console.error("Failed to load FaceLandmarker", err);
    }
    setIsAiLoading(false);
  }, []);

  const detectFace = useCallback(() => {
    if (!videoRef.current || !faceLandmarkerRef.current || !isActive) return;

    const video = videoRef.current;
    if (video.readyState >= 2) {
      let startTimeMs = performance.now();
      if (lastVideoTimeRef.current !== video.currentTime) {
        lastVideoTimeRef.current = video.currentTime;
        const results = faceLandmarkerRef.current.detectForVideo(video, startTimeMs);
        
        if (onBehaviorUpdate) {
          if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
            const blendshapes = results.faceBlendshapes[0].categories;
            
            let currentScore = 80; // Baseline good score when facing camera
            const messages: string[] = [];

            const getScore = (name: string) => blendshapes.find(b => b.categoryName === name)?.score || 0;
            
            const smileL = getScore("mouthSmileLeft");
            const smileR = getScore("mouthSmileRight");
            const eyeLookInL = getScore("eyeLookInLeft");
            const eyeLookInR = getScore("eyeLookInRight");

            const smileScore = (smileL + smileR) / 2;
            const focusScore = (eyeLookInL + eyeLookInR) / 2; // Approximates looking at screen/conversational partners

            // Accurately calculate behavioral score
            if (smileScore > 0.4) {
              currentScore += 20;
              messages.push("Positive engagement detected.");
            } else if (smileScore < 0.05) {
              currentScore -= 15;
              messages.push("Maintain a pleasant, engaging expression.");
            }

            if (focusScore > 0.6) {
              currentScore -= 20;
              messages.push("Maintain eye contact with the camera/panelists.");
            } else {
              currentScore += 10;
              messages.push("Good eye contact.");
            }

            // Cap between 0 and 100
            currentScore = Math.max(0, Math.min(100, currentScore));
            onBehaviorUpdate(currentScore, messages);
          } else {
            onBehaviorUpdate(0, ["Face not detected! Please face the camera."]);
          }
        }
      }
    }
    
    if (isActive) {
      animationFrameRef.current = requestAnimationFrame(detectFace);
    }
  }, [isActive, onBehaviorUpdate]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setHasPermission(true);
        setError(null);
        
        // Wait for model, then start detection loop
        await initModel();
        detectFace();
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setHasPermission(false);
      setError("Camera access denied. Please enable camera permissions for behavioral analysis.");
    }
  }, [initModel, detectFace]);

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Start/stop camera based on isActive
  useEffect(() => {
    if (isActive) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isActive, startCamera, stopCamera]);


  return (
    <div className={cn("relative rounded-xl overflow-hidden bg-secondary border border-border shadow-md", className)}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          "w-full h-full object-cover transform scale-x-[-1]",
          !hasPermission && "hidden"
        )}
      />

      {/* Camera off overlay */}
      {!isActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-secondary">
          <CameraOff className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Camera off</p>
        </div>
      )}

      {/* Permission denied overlay */}
      {isActive && hasPermission === false && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/10 p-4">
          <AlertCircle className="h-8 w-8 text-destructive mb-2" />
          <p className="text-sm text-destructive text-center">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {isActive && (hasPermission === null || isAiLoading) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10">
          <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
          <p className="text-sm text-primary font-medium">
            {isAiLoading ? "Loading MediaPipe AI Vison..." : "Starting camera..."}
          </p>
        </div>
      )}

      {/* Camera active indicator */}
      {isActive && hasPermission && !isAiLoading && (
        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-background/80 backdrop-blur-sm shadow-sm border border-border">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-semibold text-foreground">AI Tracking On</span>
        </div>
      )}
    </div>
  );
}
