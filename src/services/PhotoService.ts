import { SogniClient } from "@sogni-ai/sogni-client";
import { Photo, ProjectState, JobState } from "../types";
import { generateUUID } from "../utils";
import type React from 'react';

export class PhotoService {
  private sogniClient: SogniClient;
  private projectStateRef: React.MutableRefObject<ProjectState>;

  constructor(sogniClient: SogniClient, projectStateRef: React.MutableRefObject<ProjectState>) {
    this.sogniClient = sogniClient;
    this.projectStateRef = projectStateRef;
  }

  setupJobProgress(job: { id: string; onProgress: (cb: (progress: number) => void) => void; onComplete: (cb: (result: { url: string }) => void) => void; onError: (cb: (error: Error) => void) => void; }, photoIndex: number) {
    const jobId = job.id;
    this.projectStateRef.current.jobs.set(jobId, {
      index: photoIndex,
      status: "pending",
    });

    job.onProgress((progress: number) => {
      this.projectStateRef.current.jobs.get(jobId)!.status = "generating";
      (this.projectStateRef.current.jobs.get(jobId) as JobState).progress = progress;
    });

    job.onComplete((result: { url: string }) => {
      this.projectStateRef.current.jobs.get(jobId)!.status = "complete";
      (this.projectStateRef.current.jobs.get(jobId) as JobState).resultUrl = result.url;
    });

    job.onError((error: Error) => {
      this.projectStateRef.current.jobs.get(jobId)!.status = "error";
      (this.projectStateRef.current.jobs.get(jobId) as JobState).error = error.message;
    });

    return job;
  }

  async generateFromBlob(
    photoBlob: Blob,
    newPhotoIndex: number,
    dataUrl: string,
    settings: {
      selectedModel: string;
      promptGuidance: number;
      controlNetStrength: number;
      controlNetGuidanceEnd: number;
      selectedStyle: string;
    }
  ): Promise<Photo> {
    const photoId = generateUUID();
    const photo: Photo = {
      id: photoId,
      generating: true,
      images: [],
      originalDataUrl: dataUrl,
      loading: true,
      progress: 0,
    };

    try {
      interface SogniClientWithGenerate extends SogniClient {
        generateFromImage: (params: {
          image: Blob;
          model: string;
          prompt: string;
          promptGuidance: number;
          controlNetStrength: number;
          controlNetGuidanceEnd: number;
        }) => Promise<{ id: string; onProgress: (cb: (progress: number) => void) => void; onComplete: (cb: (result: { url: string }) => void) => void; onError: (cb: (error: Error) => void) => void; }>;
      }
      const job = await (this.sogniClient as SogniClientWithGenerate).generateFromImage({
        image: photoBlob,
        model: settings.selectedModel,
        prompt: settings.selectedStyle,
        promptGuidance: settings.promptGuidance,
        controlNetStrength: settings.controlNetStrength,
        controlNetGuidanceEnd: settings.controlNetGuidanceEnd,
      });

      void this.setupJobProgress(job, newPhotoIndex);
      return photo;
    } catch (error: unknown) {
      photo.error = error instanceof Error ? error.message : 'Unknown error occurred';
      photo.generating = false;
      photo.loading = false;
      return photo;
    }
  }

  async triggerFlashAndCapture(
    videoRef: React.RefObject<HTMLVideoElement>,
    flashEnabled: boolean,
    setShowFlash: (show: boolean) => void
  ): Promise<{ blob: Blob; dataUrl: string }> {
    return new Promise((resolve) => {
      if (flashEnabled) {
        setShowFlash(true);
        setTimeout(() => {
          setShowFlash(false);
          void this.captureFrame(videoRef).then(resolve);
        }, 150);
      } else {
        void this.captureFrame(videoRef).then(resolve);
      }
    });
  }

  private async captureFrame(
    videoRef: React.RefObject<HTMLVideoElement>
  ): Promise<{ blob: Blob; dataUrl: string }> {
    if (!videoRef.current) {
      throw new Error("Video element not found");
    }

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get canvas context");
    }

    ctx.drawImage(video, 0, 0);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          throw new Error("Could not create blob from canvas");
        }
        resolve({
          blob,
          dataUrl: canvas.toDataURL("image/png"),
        });
      }, "image/png");
    });
  }
} 