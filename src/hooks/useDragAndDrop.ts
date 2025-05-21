import { useState, useCallback } from 'react';
import { PhotoService } from '../services/PhotoService';
import { Photo } from '../types/index';

interface UseDragAndDropProps {
  photoService: PhotoService;
  settings: {
    selectedModel: string;
    promptGuidance: number;
    controlNetStrength: number;
    controlNetGuidanceEnd: number;
    selectedStyle: string;
  };
  setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>;
  isSogniReady: boolean;
}

export const useDragAndDrop = ({ photoService, settings, setPhotos, isSogniReady }: UseDragAndDropProps) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (!isSogniReady) {
      alert("Sogni is not ready yet.");
      return;
    }

    const files = Array.from(e.dataTransfer?.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      return;
    }

    // Process each dropped image
    for (const file of imageFiles) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (!dataUrl) return;

        setPhotos(prevPhotos => {
          const newPhotoIndex = prevPhotos.length;
          // Create blob from data URL
          const byteString = atob(dataUrl.split(',')[1]);
          const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          const blob = new Blob([ab], { type: mimeString });
          // Generate the photo
          void photoService.generateFromBlob(blob, newPhotoIndex, dataUrl, settings)
            .then(photo => {
              setPhotos(photos => {
                const updatedPhotos = [...photos];
                updatedPhotos[newPhotoIndex] = photo;
                return updatedPhotos;
              });
            });
          // Add placeholder while generating
          return [...prevPhotos, {
            id: 'placeholder',
            generating: true,
            images: [],
            loading: true,
            progress: 0
          }];
        });
      };
      reader.readAsDataURL(file);
    }
  }, [photoService, settings, setPhotos, isSogniReady]);

  return {
    dragActive,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop
  };
}; 