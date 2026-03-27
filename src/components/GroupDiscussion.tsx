import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Users, Volume2, ArrowRight, Loader2, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { WebcamFeed } from "@/components/WebcamFeed";
import { GDEvaluation } from "@/components/EvaluationReport";


interface Message {
  role: "user" | "assistant" | "participant";
  content: string;
  speaker?: string;
}

interface GroupDiscussionProps {
  topic: string;
  onEndDiscussion: (evaluation: GDEvaluation) => void;
  onCancel: () => void;
}

const PARTICIPANTS = [
  { name: "Priya", style: "analytical" },
  { name: "Rahul", style: "assertive" },
  { name: "Ananya", style: "balanced" },
];

export function GroupDiscussion({ topic, onEndDiscussion, onCancel }: GroupDiscussionProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [userTranscripts, setUserTranscripts] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [turnCount, setTurnCount] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [userInitiativeCount, setUserInitiativeCount] = useState(0);
  const [behaviorScore, setBehaviorScore] = useState<number>(0);
  const [behaviorMessages, setBehaviorMessages] = useState<string[]>([]);
  
  const behaviorScoresRef = useRef<number[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>("");
  const getGDResponseRef = useRef<(text: string) => void>(() => { });
  const isActiveRef = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Transcribe audio using Whisper via Supabase Edge Function
  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");

      const { data, error } = await supabase.functions.invoke("whisper-transcribe", {
        body: formData,
      });

      if (error) throw error;
      return data.text || "";
    } catch (error) {
      console.error("Transcription error:", error);
      return "";
    } finally {
      setIsTranscribing(false);
    }
  };

  // Initialize SpeechRecognition for real-time visual feedback + Fallback transcription
  const initRecognition = useCallback(() => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return null;
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += transcript + " ";
        } else {
          interim += transcript;
        }
      }
      setCurrentTranscript((finalTranscriptRef.current + interim).trim());
    };

    return recognition;
  }, []);

  // Text to speech using browser speechSynthesis
  const speak = useCallback((text: string, speaker: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!isActiveRef.current) {
        resolve();
        return;
      }
      setIsSpeaking(true);
      setCurrentSpeaker(speaker);

      if (!window.speechSynthesis) {
        console.warn("speechSynthesis not supported");
        setIsSpeaking(false);
        setCurrentSpeaker(null);
        resolve();
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = 1;

      // Fallback timeout to prevent permanent hang if TTS fails
      const fallbackTimer = setTimeout(() => {
        setIsSpeaking(false);
        setCurrentSpeaker(null);
        window.speechSynthesis.cancel();
        resolve();
      }, 15000); // 15 seconds max

      // Distinct voice profiles per participant
      const voices = window.speechSynthesis.getVoices();
      const enVoices = voices.filter(v => v.lang.startsWith("en"));

      if (speaker === "Priya") {
        utterance.rate = 1.05;
        utterance.pitch = 1.3;
        const voice = enVoices.find(v => v.name.includes("Samantha")) ||
          enVoices.find(v => v.name.includes("Google UK English Female")) ||
          enVoices.find(v => v.name.includes("Zira")) ||
          enVoices.find(v => v.name.toLowerCase().includes("female")) ||
          enVoices[1] || enVoices[0];
        if (voice) utterance.voice = voice;
      } else if (speaker === "Rahul") {
        utterance.rate = 0.92;
        utterance.pitch = 0.7;
        const voice = enVoices.find(v => v.name.includes("Daniel")) ||
          enVoices.find(v => v.name.includes("Google UK English Male")) ||
          enVoices.find(v => v.name.includes("David")) ||
          enVoices.find(v => v.name.toLowerCase().includes("male")) ||
          enVoices[2] || enVoices[0];
        if (voice) utterance.voice = voice;
      } else if (speaker === "Ananya") {
        utterance.rate = 1.0;
        utterance.pitch = 1.1;
        const voice = enVoices.find(v => v.name.includes("Karen") || v.name.includes("Moira")) ||
          enVoices.find(v => v.name.includes("Google US English")) ||
          enVoices.find(v => v.name.includes("Hazel") || v.name.includes("Catherine")) ||
          enVoices.filter(v => v.name.toLowerCase().includes("female"))[1] ||
          enVoices[3] || enVoices[0];
        if (voice) utterance.voice = voice;
      } else {
        // Moderator
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        const voice = enVoices.find(v => v.name.includes("Alex") || v.name.includes("Mark")) || enVoices[0];
        if (voice) utterance.voice = voice;
      }

      utterance.onend = () => {
        clearTimeout(fallbackTimer);
        if (!isActiveRef.current) {
          resolve();
          return;
        }
        setIsSpeaking(false);
        setCurrentSpeaker(null);
        resolve();
      };

      utterance.onerror = () => {
        clearTimeout(fallbackTimer);
        if (!isActiveRef.current) {
          resolve();
          return;
        }
        console.error("SpeechSynthesis error");
        setIsSpeaking(false);
        setCurrentSpeaker(null);
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }, []);

  // Init microphone
  const initMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      return stream;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Microphone Access Denied",
        description: "Please allow microphone access.",
      });
      return null;
    }
  }, [toast]);

  // Start recording with MediaRecorder + Live Feedback
  const startRecording = useCallback(() => {
    if (!streamRef.current) return;

    finalTranscriptRef.current = "";
    setCurrentTranscript("");
    audioChunksRef.current = [];

    // 1. High-Accuracy AI Recorder
    const mediaRecorder = new MediaRecorder(streamRef.current);
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };
    mediaRecorder.start();

    // 2. Live Feedback (Browser API)
    const recognition = initRecognition();
    if (recognition) {
      recognitionRef.current = recognition;
      try { recognition.start(); } catch (e) { }
    }
    setIsRecording(true);
  }, [initRecognition]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { }
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  }, [isRecording]);

  // Stop recording and process transcript
  const stopRecordingAndProcess = useCallback(() => {
    let capturedText = "";

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { }
      capturedText = currentTranscript || finalTranscriptRef.current;
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = async () => {
        if (!isStarted) return;
        
        setIsProcessing(true); // Lock UI immediately on stop
        
        // Use the browser-captured text automatically instead of the dead Supabase Whisper backend!
        const text = capturedText;

        if (text && text.trim().length > 0 && isStarted) {
          getGDResponseRef.current(text);
          setCurrentTranscript("");
          finalTranscriptRef.current = "";
        } else {
          // If the AI model returns empty text (user was silent)
          setIsProcessing(false);
          setCurrentTranscript("");
          finalTranscriptRef.current = "";
        }
      };

      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  }, [isStarted, isRecording, currentTranscript]);

  // Show each bot message one at a time, synced with voice
  const speakResponsesSequentially = useCallback(async (
    baseMessages: Message[],
    responses: Array<{ speaker: string; content: string }>
  ) => {
    let current = [...baseMessages];
    for (let i = 0; i < responses.length; i++) {
      const resp = responses[i];
      if (!isActiveRef.current) break;

      // All 5 seconds gap between AI bots discussion
      // We skip the gap for the very first AI response in the sequence
      // so the AI remains responsive to the user.
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        if (!isActiveRef.current) break;
      }

      const newMsg: Message = { role: "participant", content: resp.content, speaker: resp.speaker };
      current = [...current, newMsg];
      setMessages([...current]);
      await speak(resp.content, resp.speaker);
    }
  }, [speak]);

  // --- LOCAL MOCK GD ENGINE ---
  // Replaces the dead Supabase Edge function since the cloud project is paused
  const generateMockResponse = async (userMsgText: string | null = null, currentTurn: number, gdTopic: string) => {
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network latency

    let speaker = PARTICIPANTS[currentTurn % PARTICIPANTS.length].name;
    let content = "";
    let isOffTopic = false;
    let shouldEnd = currentTurn >= 7;

    if (!userMsgText) {
      // AI initiating after 5 seconds of silence
      
      // 20% chance an AI participant goes off-topic to simulate realism
      if (Math.random() < 0.20) {
        const offTopicPoints = [
          `Honestly, this reminds me of a completely different topic. Did anyone watch the sports game yesterday? It completely distracts from our current point.`,
          `On a totally unrelated note, I feel like we should talk about the weather and how it affects our mood instead of this.`,
          `Before we continue, I just want to mention a completely irrelevant article I read this morning. It has nothing to do with this, but it's fascinating.`
        ];
        content = offTopicPoints[Math.floor(Math.random() * offTopicPoints.length)];
        
        // The Moderator instantly catches the AI participant deviating and reprimands them
        return {
          responses: [
            { speaker, content },
            { 
              speaker: "Moderator", 
              content: `Excuse me ${speaker}, I believe you are migrating away from the core subject. Please bring your focus back to our main topic: ${gdTopic}.` 
            }
          ],
          isOffTopic: false, // False because the USER didn't do it, the AI did.
          shouldEnd
        };
      } else {
        const points = [
          `Since it's quiet, let me raise a point about ${gdTopic}. I believe it plays a crucial role in modern development.`,
          `I'll add something here. When we look at ${gdTopic}, the primary challenge usually relates to execution.`,
          `Let me jump in. We also need to consider the long-term impacts of ${gdTopic}.`,
          `To shift gears slightly regarding ${gdTopic}, what are the ethical implications?`
        ];
        content = points[Math.floor(Math.random() * points.length)];
      }

    } else {
      // AI responding to user
      const replies = [
        `That's an interesting point you made there. Relating it back to ${gdTopic}, it reveals a lot.`,
        `I'm not sure I fully agree, but it's a valid perspective on ${gdTopic}.`,
        `Building on what you just mentioned, ${gdTopic} also influences other sectors heavily.`,
        `Exactly! Furthermore, ${gdTopic} requires us to adapt quickly to these exact changes.`
      ];
      content = replies[Math.floor(Math.random() * replies.length)];
      
      // Basic Local AI Relevance / Keyword Checker to catch if the USER is off-topic
      const topicWords = gdTopic.toLowerCase().split(" ").filter(w => w.length > 3);
      const userWords = userMsgText.toLowerCase();
      // If none of the topic's main words are in the user's speech
      const hasTopicKeywords = topicWords.length === 0 || topicWords.some(w => userWords.includes(w));

      if ((userMsgText.length < 15 && userMsgText.trim() !== "") || !hasTopicKeywords) {
        isOffTopic = true; // Trigger moderation to scold the User
      }
    }

    return {
      responses: [{ speaker, content }],
      isOffTopic,
      shouldEnd
    };
  };

  // Handle AI initiation if user is silent
  const handleAIInitiation = useCallback(async () => {
    if (!isActiveRef.current || !isStarted || isProcessing || isSpeaking || isRecording || isTranscribing) return;

    // Stop any active user recording before AI takes over
    stopRecording();
    setIsProcessing(true);

    try {
      // Use local mock instead of dead remote API
      const data = await generateMockResponse(null, turnCount, topic);
      if (!isActiveRef.current || !isStarted) {
        setIsProcessing(false);
        return;
      }

      const responses = data.responses;
      if (data.isOffTopic) {
        toast({ variant: "destructive", title: "Topic Deviation Detected", description: "Stay focused on the discussion topic to improve your score." });
        responses.unshift({ speaker: "Moderator", content: `I've noticed we are migrating away from the core subject. Please bring the discussion back to our main topic: ${topic}.` });
      }

      setIsProcessing(false);
      setTurnCount(prev => prev + 1);
      if (!isActiveRef.current) return;
      await speakResponsesSequentially(messages, responses);
    } catch (error) {
      console.error("AI Initiation Error:", error);
      setIsProcessing(false);
    }
  }, [isStarted, isProcessing, isSpeaking, isRecording, isTranscribing, messages, topic, turnCount, stopRecording, speakResponsesSequentially, toast]);

  // Get GD response from AI
  const getGDResponse = useCallback(async (userMessage: string) => {
    if (!isActiveRef.current || !isStarted) return;

    setUserInitiativeCount(prev => prev + 1);
    setIsProcessing(true);

    const newMessages: Message[] = [...messages, { role: "user", content: userMessage, speaker: "You" }];
    setMessages(newMessages);
    setUserTranscripts(prev => [...prev, userMessage]);

    try {
      // Use local mock instead of dead remote API
      const data = await generateMockResponse(userMessage, turnCount, topic);
      if (!isActiveRef.current || !isStarted) {
        setIsProcessing(false);
        return;
      }

      const responses = data.responses;
      if (data.isOffTopic) {
        toast({ variant: "destructive", title: "Topic Deviation Detected", description: "Please stay focused on the discussion topic to improve your score." });
        responses.unshift({ speaker: "Moderator", content: `I've noticed we are migrating away from the core subject. Please bring the discussion back to our main topic: ${topic}.` });
      }

      setIsProcessing(false);
      setTurnCount(prev => prev + 1);

      if (isActiveRef.current && data.shouldEnd) {
        await speakResponsesSequentially(newMessages, responses);
        if (isActiveRef.current && isStarted) endGD();
      } else if (isActiveRef.current) {
        await speakResponsesSequentially(newMessages, responses);
      }
    } catch (error) {
      console.error("GD Error:", error);
      setIsProcessing(false);
    }
  }, [messages, topic, turnCount, speakResponsesSequentially, toast, isStarted]);

  // Keep ref in sync
  useEffect(() => {
    getGDResponseRef.current = getGDResponse;
  }, [getGDResponse]);

  const startGD = useCallback(async () => {
    isActiveRef.current = true;
    // Immediate state change for perceived performance
    setIsStarted(true);
    setStartTime(Date.now());
    setTurnCount(0);

    // Zero-latency moderator intro handled on frontend
    const introText = `The topic for today's discussion is ${topic}. Please start the conversation.`;
    const moderatorMsg: Message = { role: "participant", content: introText, speaker: "Moderator" };
    setMessages([moderatorMsg]);

    // Start speaking immediately
    const speakPromise = speak(introText, "Moderator");

    // Initialize microphone in background
    const stream = await initMicrophone();
    if (!stream) {
      setIsStarted(false);
      return;
    }
    setCameraActive(true);

    // Wait for the intro speech to finish
    await speakPromise;

  }, [topic, speak, initMicrophone]);

  const handleBehaviorUpdate = useCallback((score: number, messages: string[]) => {
    behaviorScoresRef.current.push(score);
    // Keep last 100 samples to smooth out the score (rolling average)
    if (behaviorScoresRef.current.length > 100) {
      behaviorScoresRef.current.shift();
    }
    const avgScore = Math.round(behaviorScoresRef.current.reduce((a, b) => a + b, 0) / behaviorScoresRef.current.length);
    setBehaviorScore(avgScore);
    setBehaviorMessages(Array.from(new Set(messages)));
  }, []);

  // End GD
  const endGD = useCallback(async () => {
    isActiveRef.current = false;
    stopRecording();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    window.speechSynthesis.cancel();
    setCameraActive(false);

    const durationSeconds = (Date.now() - startTime) / 1000;
    
    // Calculate final behavioral confidence (1-10)
    const finalBehavioralScore = behaviorScoresRef.current.length > 0 
      ? Math.round((behaviorScoresRef.current.reduce((a, b) => a + b, 0) / behaviorScoresRef.current.length) / 10)
      : 5;

    try {
      const { data, error } = await supabase.functions.invoke("evaluate-session", {
        body: {
          type: "gd",
          messages,
          userTranscripts,
          topic,
          durationSeconds,
          userInitiativeCount,
        },
      });

      if (error) throw error;

      const evaluation: GDEvaluation = {
        type: "gd",
        communication: data.communication ?? 5,
        grammarUsage: data.grammarUsage ?? 5,
        leadership: data.leadership ?? 5,
        confidence: Math.max(1, Math.min(10, finalBehavioralScore)), // Driven by Face Detection AI
        initiative: data.initiative ?? 5,
        listeningAbility: Math.max(1, Math.min(10, finalBehavioralScore)), // Driven by Face Detection AI
        topicAccuracy: data.topicAccuracy ?? 5,
        overallGDScore: data.overallGDScore ?? 5,
        whatWentWell: data.whatWentWell ?? ["Participated in the discussion"],
        lostPoints: data.lostPoints ?? [],
        improvementTips: data.improvementTips ?? ["Practice more"],
      };

      onEndDiscussion(evaluation);
    } catch (err) {
      console.error("Evaluation error:", err);
      // Fallback to basic evaluation using local AI tracking
      onEndDiscussion({
        type: "gd",
        communication: 5,
        grammarUsage: 5,
        leadership: 5,
        confidence: Math.max(1, Math.min(10, finalBehavioralScore)), // Driven by Face Detection AI
        initiative: 5,
        listeningAbility: Math.max(1, Math.min(10, finalBehavioralScore)), // Driven by Face Detection AI
        topicAccuracy: 5,
        overallGDScore: Math.round((5 + finalBehavioralScore) / 2),
        whatWentWell: ["Maintained conversation flow."],
        lostPoints: ["Backend unavailable for deeper analysis."],
        improvementTips: ["Practice speaking on diverse topics daily"],
      });
    }
  }, [startTime, userTranscripts, messages, topic, onEndDiscussion, stopRecording]);


  // Toggle recording
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecordingAndProcess();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecordingAndProcess]);

  // Robust Idle Timer effect for AI initiation
  useEffect(() => {
    // If the GD is not active, or we are processing, speaking, transcribing,
    // or the user is currently recording/on the mic, don't trigger AI takeover.
    if (!isStarted || isProcessing || isSpeaking || isTranscribing || isRecording) {
      return;
    }

    const timer = setTimeout(() => {
      // User hasn't turned on the mic for 5 seconds, AI initiates
      handleAIInitiation();
    }, 5000);

    return () => clearTimeout(timer);
  }, [isStarted, isProcessing, isSpeaking, isTranscribing, isRecording, handleAIInitiation]);

  // Cleanup
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  if (!isStarted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardContent className="p-6 space-y-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-8 w-8 text-primary" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground">Group Discussion</h2>
              <p className="text-muted-foreground">Topic:</p>
              <p className="text-lg font-medium text-foreground">"{topic}"</p>
            </div>

            <div className="bg-secondary/50 rounded-lg p-4 text-left">
              <p className="text-sm text-muted-foreground mb-2">Participants:</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">You</Badge>
                {PARTICIPANTS.map(p => (
                  <Badge key={p.name} variant="secondary">{p.name}</Badge>
                ))}
              </div>
            </div>

            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">🎙️ Powered by browser Speech Recognition</p>
              <p className="text-xs text-muted-foreground mt-1">👁️ Powered by MediaPipe Face Tracking</p>
            </div>

            <div className="flex gap-3">
              <Button onClick={() => {
                isActiveRef.current = false;
                onCancel();
              }} variant="outline" className="flex-1">
                Cancel
              </Button>
              <Button onClick={startGD} className="flex-1">
                Start Discussion
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent >
        </Card >
      </div >
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* Header */}
      <div className="bg-card border-b border-border p-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Group Discussion</h1>
            <p className="text-sm text-muted-foreground truncate max-w-md">
              {topic}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="destructive" size="sm" onClick={endGD}>
            End Discussion
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main chat area */}
        <div className="flex-1 flex flex-col p-4 max-w-4xl mx-auto w-full relative">
          
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 pb-24">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl p-4 shadow-sm",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-none"
                      : "bg-card border border-border text-card-foreground rounded-bl-none"
                  )}
                >
                  {msg.speaker && msg.role !== "user" && (
                    <p className="text-xs font-medium mb-1 opacity-70">
                      {msg.speaker === "Moderator" ? "🛡️ Moderator" : msg.speaker}
                    </p>
                  )}
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Current transcript overlay */}
          {currentTranscript && (
            <div className="absolute bottom-24 left-4 right-4 p-4 rounded-xl bg-background/90 backdrop-blur-sm border border-border shadow-lg transform transition-all">
              <div className="flex items-center gap-2 mb-2">
                <Volume2 className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">Listening</span>
              </div>
              <p className="text-sm text-foreground italic">"{currentTranscript}"</p>
            </div>
          )}

          {/* Controls Footer */}
          <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t border-border p-4 flex flex-col items-center justify-center gap-3">
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary">
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  isRecording ? "bg-red-500 animate-pulse" :
                    isTranscribing ? "bg-yellow-500 animate-pulse" : "bg-muted"
                )}
              />
              <span className="text-xs font-medium text-muted-foreground">
                {isTranscribing ? "Processing Transcript..." :
                  isProcessing ? "AI is Thinking..." :
                    isSpeaking ? `${currentSpeaker} is speaking` :
                      isRecording ? "Microphone Active (click to send)" : "Silence Detected (Waiting for your input)"}
              </span>
            </div>

            <Button
              onClick={toggleRecording}
              disabled={isSpeaking || isProcessing || isTranscribing}
              size="lg"
              variant={isRecording ? "default" : "secondary"}
              className={cn(
                "rounded-full w-16 h-16 shadow-lg transition-all duration-300",
                isRecording ? "bg-red-600 hover:bg-red-700 scale-105" : "hover:scale-105"
              )}
            >
              {isRecording ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        {/* Webcam sidebar */}
        <div className="w-80 p-4 border-l border-border hidden lg:flex flex-col gap-4 bg-secondary/30">
          <div className="flex-1">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Non-Verbal Analysis
            </h3>
            <WebcamFeed 
              isActive={cameraActive} 
              onBehaviorUpdate={handleBehaviorUpdate}
              className="aspect-video w-full shadow-md" 
            />
            
            {/* Real-time AI Tracking Display */}
            {cameraActive && behaviorScore > 0 && (
              <div className="mt-4 p-4 rounded-xl bg-card border border-border shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Engagement Score</span>
                  <span className={cn(
                    "text-sm font-bold",
                    behaviorScore >= 80 ? "text-green-500" :
                    behaviorScore >= 60 ? "text-yellow-500" : "text-red-500"
                  )}>
                    {behaviorScore}%
                  </span>
                </div>
                
                <div className="space-y-2 mt-3">
                  {behaviorMessages.map((msg, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                      <span>{msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
