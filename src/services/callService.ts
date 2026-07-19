import { Audio } from 'expo-av';
import { wsManager } from './websocket';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';

export interface CallInfo {
  state: CallState;
  peerUsername: string;
  callId: string;
  duration: number;
  isSpeakerOn: boolean;
  isMuted: boolean;
}

type CallStateCallback = (info: CallInfo) => void;
type CallActionCallback = (action: string, data: any) => void;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

class CallService {
  private state: CallState = 'idle';
  private peerUsername: string = '';
  private callId: string = '';
  private duration: number = 0;
  private isSpeakerOn: boolean = false;
  private isMuted: boolean = false;
  private startTime: number = 0;
  private durationInterval: ReturnType<typeof setInterval> | null = null;

  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private ringtoneSound: Audio.Sound | null = null;
  private pendingCandidates: RTCIceCandidate[] = [];

  private stateCallbacks: CallStateCallback[] = [];
  private actionCallbacks: CallActionCallback[] = [];
  private _unsub: (() => void) | null = null;

  init() {
    if (this._unsub) return;
    this.setupWS();
  }

  getState(): CallInfo {
    return {
      state: this.state,
      peerUsername: this.peerUsername,
      callId: this.callId,
      duration: this.duration,
      isSpeakerOn: this.isSpeakerOn,
      isMuted: this.isMuted,
    };
  }

  onStateChange(cb: CallStateCallback) {
    this.stateCallbacks.push(cb);
    return () => {
      this.stateCallbacks = this.stateCallbacks.filter(c => c !== cb);
    };
  }

  onCallAction(cb: CallActionCallback) {
    this.actionCallbacks.push(cb);
    return () => {
      this.actionCallbacks = this.actionCallbacks.filter(c => c !== cb);
    };
  }

  private notifyState() {
    const info = this.getState();
    this.stateCallbacks.forEach(cb => cb(info));
  }

  private notifyAction(action: string, data: any) {
    this.actionCallbacks.forEach(cb => cb(action, data));
  }

  private setupWS() {
    const handleCallMessage = (msg: any) => {
      switch (msg.type) {
        case 'call_initiate':
          if (this.state === 'idle') {
            this.callId = msg.call_id || msg.callId;
            this.peerUsername = msg.from_user || msg.fromUser;
            this.state = 'incoming';
            this.notifyState();
            this.notifyAction('incoming_call', { fromUser: this.peerUsername, callId: this.callId });
          }
          break;
        case 'call_accept':
          if (this.state === 'calling' && (msg.call_id || msg.callId) === this.callId) {
            this.state = 'connected';
            this.startTime = Date.now();
            this.startDurationTimer();
            this.notifyState();
            this.notifyAction('call_connected', {});
            this.startWebRTC(true);
          }
          break;
        case 'call_reject':
          if ((msg.call_id || msg.callId) === this.callId) {
            this.state = 'ended';
            this.notifyState();
            this.notifyAction('call_rejected', {});
            this.cleanup();
          }
          break;
        case 'call_end':
          if ((msg.call_id || msg.callId) === this.callId) {
            this.state = 'ended';
            this.notifyState();
            this.notifyAction('call_ended', { fromUser: msg.from_user || msg.fromUser });
            this.cleanup();
          }
          break;
        case 'call_busy':
          if (this.state === 'calling') {
            this.state = 'ended';
            this.notifyState();
            this.notifyAction('call_busy', {});
            this.cleanup();
          }
          break;
        case 'call_offline':
          if (this.state === 'calling') {
            this.state = 'ended';
            this.notifyState();
            this.notifyAction('call_offline', {});
            this.cleanup();
          }
          break;
        case 'call_ringing':
          if (this.state === 'calling') {
            this.notifyAction('peer_ringing', {});
          }
          break;
        case 'webrtc_offer':
          if (this.state === 'connected' && (msg.call_id || msg.callId) === this.callId) {
            this.handleRemoteOffer(msg.content_text || msg.contentText);
          }
          break;
        case 'webrtc_answer':
          if (this.state === 'connected' && (msg.call_id || msg.callId) === this.callId) {
            this.handleRemoteAnswer(msg.content_text || msg.contentText);
          }
          break;
        case 'webrtc_ice':
          if (this.state === 'connected' && (msg.call_id || msg.callId) === this.callId) {
            this.handleRemoteIce(msg.content_text || msg.contentText);
          }
          break;
      }
    };

    this._unsub = wsManager.onCallMessage(handleCallMessage);
  }

  async initiateCall(peerUsername: string): Promise<boolean> {
    if (this.state !== 'idle') return false;

    this.state = 'calling';
    this.peerUsername = peerUsername;
    this.callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.notifyState();

    wsManager.sendMessage({
      type: 'call_initiate',
      from_user: wsManager.getUsername(),
      to_user: peerUsername,
      call_id: this.callId,
    });

    return true;
  }

  async acceptCall() {
    if (this.state !== 'incoming') return;

    this.state = 'connected';
    this.startTime = Date.now();
    this.startDurationTimer();
    this.notifyState();

    wsManager.sendMessage({
      type: 'call_accept',
      from_user: wsManager.getUsername(),
      to_user: this.peerUsername,
      call_id: this.callId,
    });

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    });

    this.startWebRTC(false);
  }

  async rejectCall() {
    if (this.state !== 'incoming') return;

    wsManager.sendMessage({
      type: 'call_reject',
      from_user: wsManager.getUsername(),
      to_user: this.peerUsername,
      call_id: this.callId,
    });

    this.state = 'ended';
    this.notifyState();
    this.cleanup();
  }

  async endCall() {
    if (this.state === 'idle' || this.state === 'ended') return;

    this.closePC();

    wsManager.sendMessage({
      type: 'call_end',
      from_user: wsManager.getUsername(),
      to_user: this.peerUsername,
      call_id: this.callId,
      duration: this.duration,
    });

    this.state = 'ended';
    this.notifyState();
    this.cleanup();
  }

  sendRinging() {
    wsManager.sendMessage({
      type: 'call_ringing',
      from_user: wsManager.getUsername(),
      to_user: this.peerUsername,
      call_id: this.callId,
    });
  }

  toggleSpeaker() {
    this.isSpeakerOn = !this.isSpeakerOn;
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    }).catch(() => {});
    this.notifyState();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isMuted;
      });
    }
    this.notifyState();
  }

  private startDurationTimer() {
    this.durationInterval = setInterval(() => {
      this.duration = Math.floor((Date.now() - this.startTime) / 1000);
      this.notifyState();
    }, 1000);
  }

  private async startWebRTC(isCaller: boolean) {
    try {
      this.localStream = await mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      console.error('Failed to get microphone:', e);
      this.notifyAction('error', 'microphone_access_denied');
      this.endCall();
      return;
    }

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.localStream.getAudioTracks().forEach(track => {
      this.pc!.addTrack(track, this.localStream!);
    });

    (this.pc as any).onicecandidate = (event: any) => {
      if (event.candidate) {
        const candidateStr = JSON.stringify(event.candidate);
        wsManager.sendMessage({
          type: 'webrtc_ice',
          from_user: wsManager.getUsername(),
          to_user: this.peerUsername,
          call_id: this.callId,
          content_text: candidateStr,
        });
      }
    };

    (this.pc as any).ontrack = (event: any) => {
      this.remoteStream = event.streams?.[0] || null;
      this.notifyAction('remote_stream_ready', {});
    };

    (this.pc as any).oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.endCall();
      }
    };

    if (isCaller) {
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
      });
      await this.pc.setLocalDescription(offer);
      wsManager.sendMessage({
        type: 'webrtc_offer',
        from_user: wsManager.getUsername(),
        to_user: this.peerUsername,
        call_id: this.callId,
        content_text: JSON.stringify(this.pc.localDescription),
      });
    }
  }

  private async handleRemoteOffer(sdpJson: string) {
    try {
      const desc = JSON.parse(sdpJson);
      const offer = new RTCSessionDescription(desc);
      await this.pc?.setRemoteDescription(offer);

      for (const candidate of this.pendingCandidates) {
        await this.pc?.addIceCandidate(candidate);
      }
      this.pendingCandidates = [];

      const answer = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(answer);
      wsManager.sendMessage({
        type: 'webrtc_answer',
        from_user: wsManager.getUsername(),
        to_user: this.peerUsername,
        call_id: this.callId,
        content_text: JSON.stringify(this.pc!.localDescription),
      });
    } catch (e) {
      console.error('handleRemoteOffer error:', e);
    }
  }

  private async handleRemoteAnswer(sdpJson: string) {
    try {
      const desc = JSON.parse(sdpJson);
      const answer = new RTCSessionDescription(desc);
      await this.pc?.setRemoteDescription(answer);

      for (const candidate of this.pendingCandidates) {
        await this.pc?.addIceCandidate(candidate);
      }
      this.pendingCandidates = [];
    } catch (e) {
      console.error('handleRemoteAnswer error:', e);
    }
  }

  private async handleRemoteIce(iceJson: string) {
    try {
      const data = JSON.parse(iceJson);
      const candidate = new RTCIceCandidate(data);
      if (this.pc?.remoteDescription) {
        await this.pc.addIceCandidate(candidate);
      } else {
        this.pendingCandidates.push(candidate);
      }
    } catch (e) {
      console.error('handleRemoteIce error:', e);
    }
  }

  private closePC() {
    if (this.pc) {
      (this.pc as any).onicecandidate = null;
      (this.pc as any).ontrack = null;
      (this.pc as any).oniceconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
    this.pendingCandidates = [];
  }

  async playRingtone() {
    try {
      if (this.ringtoneSound) {
        await this.ringtoneSound.replayAsync();
        return;
      }
      const sampleRate = 8000;
      const beepDuration = 0.15;
      const pauseDuration = 0.1;
      const numBeeps = 3;
      const totalSamples = Math.floor((beepDuration + pauseDuration) * numBeeps * sampleRate);

      const wavHeader = new ArrayBuffer(44);
      const headerView = new DataView(wavHeader);
      const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) headerView.setUint8(offset + i, str.charCodeAt(i));
      };
      writeString(0, 'RIFF');
      headerView.setUint32(4, 36 + totalSamples, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      headerView.setUint32(16, 16, true);
      headerView.setUint16(20, 1, true);
      headerView.setUint16(22, 1, true);
      headerView.setUint32(24, sampleRate, true);
      headerView.setUint32(28, sampleRate * 1, true);
      headerView.setUint16(32, 1, true);
      headerView.setUint16(34, 8, true);
      writeString(36, 'data');
      headerView.setUint32(40, totalSamples, true);

      const samples = new Uint8Array(totalSamples);
      let sampleIndex = 0;
      const beepSamples = Math.floor(beepDuration * sampleRate);
      const pauseSamples = Math.floor(pauseDuration * sampleRate);
      for (let beep = 0; beep < numBeeps; beep++) {
        const freq = beep % 2 === 0 ? 440 : 660;
        for (let i = 0; i < beepSamples; i++) {
          const t = i / sampleRate;
          const value = Math.sin(2 * Math.PI * freq * t) * 0.5 + 0.5;
          samples[sampleIndex++] = Math.floor(value * 255);
        }
        for (let i = 0; i < pauseSamples; i++) {
          samples[sampleIndex++] = 128;
        }
      }

      const wavBytes = new Uint8Array(44 + totalSamples);
      wavBytes.set(new Uint8Array(wavHeader), 0);
      wavBytes.set(samples, 44);

      const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let base64 = '';
      for (let i = 0; i < wavBytes.length; i += 3) {
        const a = wavBytes[i] ?? 0;
        const b = wavBytes[i + 1] ?? 0;
        const c = wavBytes[i + 2] ?? 0;
        base64 += base64Chars[a >> 2];
        base64 += base64Chars[((a & 3) << 4) | (b >> 4)];
        base64 += base64Chars[((b & 15) << 2) | (c >> 6)];
        base64 += base64Chars[c & 63];
      }
      const pad = wavBytes.length % 3;
      if (pad === 1) base64 = base64.slice(0, -2) + '==';
      else if (pad === 2) base64 = base64.slice(0, -1) + '=';
      const dataUri = `data:audio/wav;base64,${base64}`;

      const { sound } = await Audio.Sound.createAsync(
        { uri: dataUri },
        { shouldPlay: true, isLooping: true }
      );
      this.ringtoneSound = sound;
    } catch (e) {
      console.error('Ringtone generation failed:', e);
    }
  }

  async stopRingtone() {
    if (this.ringtoneSound) {
      await this.ringtoneSound.stopAsync();
      await this.ringtoneSound.unloadAsync();
      this.ringtoneSound = null;
    }
  }

  private async cleanup() {
    this.closePC();
    this.stopRingtone();

    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });
    } catch {}

    setTimeout(() => {
      this.state = 'idle';
      this.peerUsername = '';
      this.callId = '';
      this.duration = 0;
      this.isSpeakerOn = false;
      this.isMuted = false;
      this.notifyState();
    }, 2000);
  }

  reset() {
    this.closePC();
    this.stopRingtone();
    this.state = 'idle';
    this.peerUsername = '';
    this.callId = '';
    this.duration = 0;
    this.isSpeakerOn = false;
    this.isMuted = false;
    this.notifyState();
  }
}

export const callService = new CallService();
