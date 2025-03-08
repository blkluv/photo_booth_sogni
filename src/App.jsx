import React, { useRef, useEffect, useState } from 'react';
import { SogniClient } from "@sogni-ai/sogni-client";

const stylePrompts = {
  gorillaz: `A vibrant, stylized cartoon band portrait inspired by the edgy, urban comic style of "Gorillaz." Bold, inky outlines and gritty details, with slightly exaggerated facial features and a rebellious attitude. A blend of punk, hip-hop, and futuristic aesthetics. Characters posed in front of a graffiti-covered cityscape, evoking the moody, dystopian vibe of modern pop culture. Sharp contrasts and dramatic shadows, muted yet punchy color palette, clean character silhouettes, high detail, cinematic lighting. 4K resolution, high-quality illustration.`,
  anime: `A colorful and vibrant anime-style portrait, highly detailed with smooth shading, expressive large eyes, dynamic pose, and clean lines. Soft yet vivid color palette, captivating expression, detailed background with Japanese-inspired elements, cinematic lighting, and high-resolution.`
};

const App = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [selectedStyle, setSelectedStyle] = useState('anime');
  const [loading, setLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState(null);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        videoRef.current.srcObject = stream;
      })
      .catch(err => alert(`Error accessing webcam: ${err}`));
  }, []);

  const captureAndSend = async () => {
    setLoading(true);
    const canvas = canvasRef.current;
    const video = videoRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (snapshotBlob) => {
      const arrayBuffer = await snapshotBlob.arrayBuffer();
      const sogni = await SogniClient.createInstance({
        appId: import.meta.env.VITE_SOGNI_APP_ID,
        testnet: true,
        network: 'fast',
        logLevel: 'warn',
      });

      await sogni.account.login(
        import.meta.env.VITE_SOGNI_USERNAME,
        import.meta.env.VITE_SOGNI_PASSWORD
      );

      const project = await sogni.projects.create({
        modelId: 'flux1-schnell-fp8',
        positivePrompt: stylePrompts[selectedStyle],
        sizePreset: "landscape_9_7",
        steps: 4,
        guidance: 3,
        numberOfImages: 1,
        startingImage: new Uint8Array(arrayBuffer),
        startingImageStrength: 0.50,
        scheduler: 'DPM Solver Multistep (DPM-Solver++)',
        timeStepSpacing: 'Karras',
      });

      project.on('completed', (data) => {
        setGeneratedImage(data[0]);
        setLoading(false);
      });

      project.on('failed', (err) => {
        alert(`Generation failed: ${err}`);
        setLoading(false);
      });
    }, 'image/png');
  };

  return (
    <div className="flex flex-col h-screen items-center justify-center">
      {!generatedImage ? (
        <>
          <video ref={videoRef} autoPlay className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute top-4 left-4 bg-gray-800 bg-opacity-70 p-4 rounded-lg shadow-xl">
            <select
              className="px-4 py-2 rounded bg-gray-700 mb-2 outline-none"
              value={selectedStyle}
              onChange={(e) => setSelectedStyle(e.target.value)}
            >
              <option value="anime">Anime</option>
              <option value="gorillaz">Gorillaz</option>
            </select>
            <button
              className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 transition"
              onClick={captureAndSend}
              disabled={loading}
            >
              {loading ? 'Generating...' : 'Start'}
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center w-full h-full">
          <img src={generatedImage} alt="Generated Result" className="max-h-full max-w-full" />
          <button
            className="mt-4 px-4 py-2 bg-red-500 rounded hover:bg-red-600 transition"
            onClick={() => setGeneratedImage(null)}
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
