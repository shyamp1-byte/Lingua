import { sendAudioChunk } from "./socket";

let audioCtx: AudioContext | null = null;
let stream: MediaStream | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let worklet: AudioWorkletNode | null = null;

export async function startAudioCapture(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Microphone access is not available. On macOS, grant microphone permission to Lingua in System Settings → Privacy & Security → Microphone."
    );
  }
  stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  audioCtx = new AudioContext();

  await audioCtx.audioWorklet.addModule("/pcm-processor.js");

  source = audioCtx.createMediaStreamSource(stream);
  worklet = new AudioWorkletNode(audioCtx, "pcm-processor", {
    processorOptions: { targetSampleRate: 16000 },
    channelCount: 1,
    channelCountMode: "explicit",
  });

  worklet.port.onmessage = (e: MessageEvent<Int16Array>) => {
    sendAudioChunk(e.data.buffer as ArrayBuffer);
  };

  source.connect(worklet);
  // do not connect worklet to destination — avoids mic feedback
}

export function stopAudioCapture(): void {
  source?.disconnect();
  worklet?.disconnect();
  stream?.getTracks().forEach((t) => t.stop());
  audioCtx?.close();
  audioCtx = null;
  stream = null;
  source = null;
  worklet = null;
}
