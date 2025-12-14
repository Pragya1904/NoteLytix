import { useState, useRef, useCallback, useEffect } from 'react';

export const useAudioRecorder = (userEmail) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [transcript, setTranscript] = useState([]);
    const [error, setError] = useState(null);
    const [meetingId, setMeetingId] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState('disconnected');

    const ws = useRef(null);
    const audioContext = useRef(null);
    const processor = useRef(null);
    const streamRef = useRef(null);
    const audioQueue = useRef([]);
    const keepAliveInterval = useRef(null);
    const isConnecting = useRef(false);

    // Helpers for PCM conversion
    const downsampleBuffer = (buffer, inputSampleRate, outputSampleRate) => {
        if (outputSampleRate === inputSampleRate) {
            return buffer;
        }
        var sampleRateRatio = inputSampleRate / outputSampleRate;
        var newLength = Math.round(buffer.length / sampleRateRatio);
        var result = new Float32Array(newLength);
        var offsetResult = 0;
        var offsetBuffer = 0;
        while (offsetResult < result.length) {
            var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
            var accum = 0, count = 0;
            for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
                accum += buffer[i];
                count++;
            }
            result[offsetResult] = accum / count;
            offsetResult++;
            offsetBuffer = nextOffsetBuffer;
        }
        return result;
    }

    const floatTo16BitPCM = (output, offset, input) => {
        for (var i = 0; i < input.length; i++, offset += 2) {
            var s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }

    const createMeeting = async () => {
        try {
            const response = await fetch('http://localhost:8083/meeting/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_email: userEmail || 'testuser' })
            });
            const data = await response.json();
            return data.meeting_id;
        } catch (err) {
            console.error("Failed to create meeting:", err);
            throw err;
        }
    };

    const stopAudioProcessing = () => {
        if (processor.current) {
            processor.current.disconnect();
            processor.current.onaudioprocess = null;
            processor.current = null;
        }
        if (audioContext.current) {
            audioContext.current.close();
            audioContext.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    };

    const statusRef = useRef('disconnected');
    useEffect(() => { statusRef.current = connectionStatus; }, [connectionStatus]);

    const flushAudioQueueRef = () => {
        if (ws.current?.readyState === WebSocket.OPEN && statusRef.current === 'connected') {
            while (audioQueue.current.length > 0) {
                const chunk = audioQueue.current.shift();
                ws.current.send(chunk);
            }
        }
    };

    const startAudioProcessing = (stream) => {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext.current = new AudioContext();
        const source = audioContext.current.createMediaStreamSource(stream);

        processor.current = audioContext.current.createScriptProcessor(4096, 1, 1);

        source.connect(processor.current);
        processor.current.connect(audioContext.current.destination);

        processor.current.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);

            const downsampled = downsampleBuffer(inputData, audioContext.current.sampleRate, 16000);
            const buffer = new ArrayBuffer(downsampled.length * 2);
            const view = new DataView(buffer);
            floatTo16BitPCM(view, 0, downsampled);

            audioQueue.current.push(buffer);
            flushAudioQueueRef();
        };
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (ws.current) ws.current.close();
            stopAudioProcessing();
            if (keepAliveInterval.current) clearInterval(keepAliveInterval.current);
        };
    }, []);

    const startRecording = useCallback(async () => {
        if (isConnecting.current || isRecording) return;

        setError(null);
        isConnecting.current = true;
        setConnectionStatus('connecting');

        try {
            const newMeetingId = await createMeeting();
            setMeetingId(newMeetingId);

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1
                }
            });
            streamRef.current = stream;

            if (ws.current) {
                ws.current.close();
            }

            ws.current = new WebSocket('ws://localhost:8082/v1/stt/ws');

            ws.current.onopen = () => {
                console.log('WS Connected. Sending Handshake...');
                ws.current.send(JSON.stringify({
                    event: "start_meeting",
                    meeting_id: newMeetingId
                }));

                keepAliveInterval.current = setInterval(() => {
                    if (ws.current?.readyState === WebSocket.OPEN) {
                        ws.current.send(JSON.stringify({ event: "keep_alive" }));
                    }
                }, 5000);

                startAudioProcessing(stream);
            };

            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.event === "connected_stt") {
                        console.log("STT Connected.");
                        setConnectionStatus('connected');
                        setIsRecording(true);
                        setIsPaused(false);
                        isConnecting.current = false;
                        flushAudioQueueRef();
                    }
                    else if (data.event === "transcribed_text") {
                        setTranscript(prev => [...prev, {
                            id: Date.now(),
                            speaker: 'Sarvam',
                            text: data.text,
                            time: new Date().toLocaleTimeString()
                        }]);
                    }
                    else if (data.error) {
                        console.error("Backend Error:", data.error);
                        setError(data.error);
                        isConnecting.current = false;
                    }
                } catch (e) {
                }
            };

            ws.current.onerror = (e) => {
                console.error("WebSocket error:", e);
                setError("Connection error");
                isConnecting.current = false;
            };

            ws.current.onclose = () => {
                console.log("WebSocket closed");
                setIsRecording(false);
                setConnectionStatus('disconnected');
                stopAudioProcessing();
                if (keepAliveInterval.current) clearInterval(keepAliveInterval.current);
                isConnecting.current = false;
            };

        } catch (err) {
            console.error("Error starting recording:", err);
            setError("Could not start recording");
            isConnecting.current = false;
            setConnectionStatus('disconnected');
        }
    }, [userEmail, isRecording]); // Added isRecording to dependencies

    const pauseRecording = useCallback(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ event: "pause_meeting" }));
            setIsPaused(true);
            setConnectionStatus('paused');
        }
    }, []);

    const resumeRecording = useCallback(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ event: "resume_meeting" }));
            setConnectionStatus('connecting');
            setIsPaused(false);
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ event: "end_meeting" }));
            ws.current.close();
        }
        stopAudioProcessing();
        setIsRecording(false);
        setIsPaused(false);
        setConnectionStatus('disconnected');
        setMeetingId(null);
        isConnecting.current = false;
    }, []);

    return {
        isRecording,
        isPaused,
        startRecording,
        stopRecording,
        pauseRecording,
        resumeRecording,
        transcript,
        error
    };
};
