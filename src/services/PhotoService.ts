import { SogniClient } from "@sogni-ai/sogni-client";
import { Photo } from "../types";
import { generateUUID } from "../utils";

export class PhotoService {
  private sogniClient: SogniClient;
  private projectStateRef: React.MutableRefObject<{
    currentPhotoIndex: number;
    jobs: Map<string, any>;
    startedJobs: Set<string>;
    completedJobs: Map<string, any>;
    pendingCompletions: Map<string, any>;
  }>;

  constructor(sogniClient: SogniClient, projectStateRef: any) {
    this.sogniClient = sogniClient;
    this.projectStateRef = projectStateRef;
  }

  setupJobProgress(job: any, photoIndex: number) {
    const jobId = job.id;
    this.projectStateRef.current.jobs.set(jobId, {
      index: photoIndex,
      status: "pending",
    });

    job.onProgress((progress: number) => {
      this.projectStateRef.current.jobs.get(jobId).status = "generating";
      this.projectStateRef.current.jobs.get(jobId).progress = progress;
    });

    job.onComplete((result: any) => {
      this.projectStateRef.current.jobs.get(jobId).status = "complete";
      this.projectStateRef.current.jobs.get(jobId).resultUrl = result.url;
    });

    job.onError((error: Error) => {
      this.projectStateRef.current.jobs.get(jobId).status = "error";
      this.projectStateRef.current.jobs.get(jobId).error = error.message;
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
      customPrompt?: string;
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
      const job = await this.sogniClient.generateFromImage({
        image: photoBlob,
        model: settings.selectedModel,
        prompt: settings.customPrompt || settings.selectedStyle,
        promptGuidance: settings.promptGuidance,
        controlNetStrength: settings.controlNetStrength,
        controlNetGuidanceEnd: settings.controlNetGuidanceEnd,
      });

      this.setupJobProgress(job, newPhotoIndex);
      return photo;
    } catch (error) {
      photo.error = error.message;
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
          this.captureFrame(videoRef).then(resolve);
        }, 150);
      } else {
        this.captureFrame(videoRef).then(resolve);
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