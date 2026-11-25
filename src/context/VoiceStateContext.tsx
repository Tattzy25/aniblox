import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type VoicePermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable';

export type VoiceChannelStatus =
  | 'idle'
  | 'requesting'
  | 'connected'
  | 'muted'
  | 'error';

export interface VoiceStateContextValue {
  permissionState: VoicePermissionState;
  channelStatus: VoiceChannelStatus;
  activeChannelId: string | null;
  activeChannelName: string | null;
  isVoiceActive: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  localStream: MediaStream | null;
  errorMessage: string | null;
  connectedPeerIds: string[];
  checkPermission: () => Promise<VoicePermissionState>;
  requestPermission: () => Promise<boolean>;
  joinChannel: (channelId: string, channelName?: string) => Promise<MediaStream | null>;
  leaveChannel: () => void;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  setConnectedPeers: (peerIds: string[]) => void;
  addConnectedPeer: (peerId: string) => void;
  removeConnectedPeer: (peerId: string) => void;
  clearError: () => void;
}

export const VoiceStateContext = createContext<VoiceStateContextValue | null>(null);

function mapMediaError(err: unknown): {
  permission: VoicePermissionState;
  message: string;
} {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return {
          permission: 'denied',
          message:
            'Microphone access was denied. Allow microphone permissions in your browser settings to use voice chat.',
        };
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return {
          permission: 'unavailable',
          message:
            'No microphone device was found. Connect a microphone and try again.',
        };
      case 'NotReadableError':
      case 'TrackStartError':
        return {
          permission: 'granted',
          message:
            'Your microphone is currently in use by another application or could not be started.',
        };
      case 'SecurityError':
        return {
          permission: 'unavailable',
          message:
            'Microphone access is blocked by browser security or permissions policy in this context.',
        };
      default:
        return {
          permission: 'prompt',
          message: err.message || 'Unable to access microphone.',
        };
    }
  }
  return {
    permission: 'prompt',
    message: err instanceof Error ? err.message : 'Unable to access microphone.',
  };
}

function isMediaSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

export const VoiceStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [permissionState, setPermissionState] = useState<VoicePermissionState>(() =>
    isMediaSupported() ? 'prompt' : 'unavailable'
  );
  const [channelStatus, setChannelStatus] = useState<VoiceChannelStatus>('idle');
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeChannelName, setActiveChannelName] = useState<string | null>(null);
  const [isMuted, setIsMutedState] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectedPeerIds, setConnectedPeerIds] = useState<string[]>([]);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const isMutedRef = useRef(false);
  const requestInFlightRef = useRef<Promise<MediaStream | null> | null>(null);

  const stopAudioMonitor = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setIsSpeaking(false);
    setAudioLevel(0);
  }, []);

  const stopMediaStream = useCallback(() => {
    stopAudioMonitor();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      streamRef.current = null;
    }
    setLocalStream(null);
  }, [stopAudioMonitor]);

  const leaveChannel = useCallback(() => {
    stopMediaStream();
    activeChannelIdRef.current = null;
    isMutedRef.current = false;
    setActiveChannelId(null);
    setActiveChannelName(null);
    setIsMutedState(false);
    setChannelStatus('idle');
    setConnectedPeerIds([]);
  }, [stopMediaStream]);

  const startAudioMonitor = useCallback(
    (stream: MediaStream) => {
      stopAudioMonitor();
      const AudioCtx =
        typeof window !== 'undefined'
          ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          : undefined;
      if (!AudioCtx) return;

      try {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        src.connect(analyser);

        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        const bins = new Uint8Array(analyser.frequencyBinCount);

        let lastSpeaking = false;
        let lastLevelUpdate = 0;

        const tick = (now: number) => {
          if (!streamRef.current || !analyserRef.current) return;
          if (isMutedRef.current) {
            if (lastSpeaking) {
              lastSpeaking = false;
              setIsSpeaking(false);
            }
            setAudioLevel(0);
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          analyserRef.current.getByteFrequencyData(bins);
          let sum = 0;
          for (let i = 0; i < bins.length; i++) sum += bins[i];
          const avg = sum / bins.length;
          const speakingNow = avg > 14;
          const normalized = Math.min(1, avg / 75);

          if (speakingNow !== lastSpeaking) {
            lastSpeaking = speakingNow;
            setIsSpeaking(speakingNow);
          }
          if (now - lastLevelUpdate > 80) {
            lastLevelUpdate = now;
            setAudioLevel(normalized);
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch {
        // AudioContext unavailable in restricted environments; WebRTC stream still functions
      }
    },
    [stopAudioMonitor]
  );

  const checkPermission = useCallback(async (): Promise<VoicePermissionState> => {
    if (!isMediaSupported()) {
      setPermissionState('unavailable');
      return 'unavailable';
    }
    if (typeof navigator.permissions?.query === 'function') {
      try {
        const status = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        });
        const mapped: VoicePermissionState =
          status.state === 'granted' || status.state === 'denied' ? status.state : 'prompt';
        setPermissionState(mapped);
        return mapped;
      } catch {
        // Browser does not support querying 'microphone' permission
      }
    }
    return permissionState;
  }, [permissionState]);

  // Monitor browser permission changes so revocations mid-session are handled gracefully
  useEffect(() => {
    if (!isMediaSupported()) {
      setPermissionState('unavailable');
      return;
    }

    let mounted = true;
    let permStatus: PermissionStatus | null = null;

    const handleChange = () => {
      if (!mounted || !permStatus) return;
      const next: VoicePermissionState =
        permStatus.state === 'granted' || permStatus.state === 'denied'
          ? permStatus.state
          : 'prompt';
      setPermissionState(next);
      if (next === 'denied' && activeChannelIdRef.current) {
        leaveChannel();
        setChannelStatus('error');
        setErrorMessage(
          'Microphone permission was revoked. Voice channel disconnected.'
        );
      }
    };

    if (typeof navigator.permissions?.query === 'function') {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((status) => {
          if (!mounted) return;
          permStatus = status;
          handleChange();
          status.addEventListener?.('change', handleChange);
        })
        .catch(() => {
          // Ignore unsupported Permissions API queries
        });
    }

    return () => {
      mounted = false;
      permStatus?.removeEventListener?.('change', handleChange);
    };
  }, [leaveChannel]);

  // Ensure hardware tracks are always released on provider unmount
  useEffect(() => {
    return () => {
      stopMediaStream();
    };
  }, [stopMediaStream]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isMediaSupported()) {
      setPermissionState('unavailable');
      setErrorMessage('Microphone access is not supported in this browser.');
      return false;
    }
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermissionState('granted');
      // Release probe stream immediately if we are not inside an active voice channel
      if (!activeChannelIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
      }
      return true;
    } catch (err) {
      const mapped = mapMediaError(err);
      setPermissionState(mapped.permission);
      setErrorMessage(mapped.message);
      return false;
    }
  }, []);

  const joinChannel = useCallback(
    async (channelId: string, channelName?: string): Promise<MediaStream | null> => {
      if (!channelId) return null;

      // Reuse active live stream if joining the same channel
      if (
        activeChannelIdRef.current === channelId &&
        streamRef.current &&
        streamRef.current.getAudioTracks().some((t) => t.readyState === 'live')
      ) {
        return streamRef.current;
      }

      if (requestInFlightRef.current) {
        return requestInFlightRef.current;
      }

      if (!isMediaSupported()) {
        setPermissionState('unavailable');
        setChannelStatus('error');
        setErrorMessage(
          'Microphone access is unavailable in this browser or insecure context.'
        );
        return null;
      }

      const task = (async (): Promise<MediaStream | null> => {
        if (activeChannelIdRef.current && activeChannelIdRef.current !== channelId) {
          stopMediaStream();
        }

        setErrorMessage(null);
        setChannelStatus('requesting');

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });

          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length === 0) {
            stream.getTracks().forEach((t) => t.stop());
            setPermissionState('unavailable');
            setChannelStatus('error');
            setErrorMessage('No active audio input track was provided.');
            return null;
          }

          audioTracks.forEach((track) => {
            track.enabled = true;
            track.onended = () => {
              if (activeChannelIdRef.current === channelId) {
                leaveChannel();
                setChannelStatus('error');
                setErrorMessage('Microphone disconnected during voice session.');
              }
            };
          });

          streamRef.current = stream;
          activeChannelIdRef.current = channelId;
          isMutedRef.current = false;

          setPermissionState('granted');
          setLocalStream(stream);
          setActiveChannelId(channelId);
          setActiveChannelName(channelName || channelId);
          setIsMutedState(false);
          setChannelStatus('connected');
          startAudioMonitor(stream);

          return stream;
        } catch (err) {
          const mapped = mapMediaError(err);
          setPermissionState(mapped.permission);
          setChannelStatus('error');
          setErrorMessage(mapped.message);
          activeChannelIdRef.current = null;
          setActiveChannelId(null);
          setActiveChannelName(null);
          return null;
        } finally {
          requestInFlightRef.current = null;
        }
      })();

      requestInFlightRef.current = task;
      return task;
    },
    [leaveChannel, startAudioMonitor, stopMediaStream]
  );

  const setMuted = useCallback((muted: boolean) => {
    isMutedRef.current = muted;
    setIsMutedState(muted);
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    if (muted) {
      setIsSpeaking(false);
      setAudioLevel(0);
    }
    if (activeChannelIdRef.current) {
      setChannelStatus(muted ? 'muted' : 'connected');
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(!isMutedRef.current);
  }, [setMuted]);

  const setConnectedPeers = useCallback((peerIds: string[]) => {
    setConnectedPeerIds(Array.from(new Set(peerIds)));
  }, []);

  const addConnectedPeer = useCallback((peerId: string) => {
    setConnectedPeerIds((prev) => (prev.includes(peerId) ? prev : [...prev, peerId]));
  }, []);

  const removeConnectedPeer = useCallback((peerId: string) => {
    setConnectedPeerIds((prev) => prev.filter((id) => id !== peerId));
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
    if (!activeChannelIdRef.current) {
      setChannelStatus('idle');
    }
  }, []);

  const isVoiceActive =
    activeChannelId !== null &&
    (channelStatus === 'connected' || channelStatus === 'muted');

  const value = useMemo<VoiceStateContextValue>(
    () => ({
      permissionState,
      channelStatus,
      activeChannelId,
      activeChannelName,
      isVoiceActive,
      isMuted,
      isSpeaking,
      audioLevel,
      localStream,
      errorMessage,
      connectedPeerIds,
      checkPermission,
      requestPermission,
      joinChannel,
      leaveChannel,
      toggleMute,
      setMuted,
      setConnectedPeers,
      addConnectedPeer,
      removeConnectedPeer,
      clearError,
    }),
    [
      permissionState,
      channelStatus,
      activeChannelId,
      activeChannelName,
      isVoiceActive,
      isMuted,
      isSpeaking,
      audioLevel,
      localStream,
      errorMessage,
      connectedPeerIds,
      checkPermission,
      requestPermission,
      joinChannel,
      leaveChannel,
      toggleMute,
      setMuted,
      setConnectedPeers,
      addConnectedPeer,
      removeConnectedPeer,
      clearError,
    ]
  );

  return (
    <VoiceStateContext.Provider value={value}>
      {children}
    </VoiceStateContext.Provider>
  );
};

export function useVoiceState(): VoiceStateContextValue {
  const ctx = useContext(VoiceStateContext);
  if (!ctx) {
    throw new Error('useVoiceState must be used within a VoiceStateProvider');
  }
  return ctx;
}
