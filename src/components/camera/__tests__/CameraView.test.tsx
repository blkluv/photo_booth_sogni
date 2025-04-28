import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CameraView from '../CameraView';

describe('CameraView', () => {
  const mockVideoRef = { current: document.createElement('video') };
  const defaultProps = {
    videoRef: mockVideoRef,
    isReady: true,
    countdown: 0,
    showFlash: false,
    isDisabled: false,
    buttonLabel: 'Take Photo',
    onTakePhoto: jest.fn(),
    isAnimating: false,
    showPhotoGrid: false,
    selectedStyle: 'Classic',
    onStyleSelect: jest.fn(),
    showSettings: false,
    onToggleSettings: jest.fn(),
  };

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('renders the webcam video element', () => {
    render(<CameraView {...defaultProps} />);
    expect(screen.getByTestId('camera-video')).toBeInTheDocument();
  });

  it('renders the title', () => {
    render(<CameraView {...defaultProps} />);
    expect(screen.getByText('SOGNI PHOTOBOOTH')).toBeInTheDocument();
  });

  it('renders the settings button', () => {
    render(<CameraView {...defaultProps} />);
    const settingsButton = screen.getByRole('button', { name: /settings/i });
    expect(settingsButton).toBeInTheDocument();
  });

  it('calls onToggleSettings when settings button is clicked', () => {
    render(<CameraView {...defaultProps} />);
    const settingsButton = screen.getByRole('button', { name: /settings/i });
    fireEvent.click(settingsButton);
    expect(defaultProps.onToggleSettings).toHaveBeenCalled();
  });

  it('renders the style selector with current style', () => {
    render(<CameraView {...defaultProps} />);
    const styleButton = screen.getByRole('button', { name: defaultProps.selectedStyle });
    expect(styleButton).toBeInTheDocument();
  });

  it('calls onStyleSelect when style button is clicked', () => {
    render(<CameraView {...defaultProps} />);
    const styleButton = screen.getByRole('button', { name: defaultProps.selectedStyle });
    fireEvent.click(styleButton);
    expect(defaultProps.onStyleSelect).toHaveBeenCalled();
  });

  it('shows countdown overlay when countdown is active', () => {
    render(<CameraView {...defaultProps} countdown={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows flash overlay when showFlash is true', () => {
    render(<CameraView {...defaultProps} showFlash={true} />);
    expect(screen.getByTestId('flash-overlay')).toBeInTheDocument();
  });

  it('disables shutter button when isDisabled is true', () => {
    render(<CameraView {...defaultProps} isDisabled={true} />);
    const shutterButton = screen.getByRole('button', { name: defaultProps.buttonLabel });
    expect(shutterButton).toBeDisabled();
  });

  it('calls onTakePhoto when shutter button is clicked', () => {
    render(<CameraView {...defaultProps} />);
    const shutterButton = screen.getByRole('button', { name: defaultProps.buttonLabel });
    fireEvent.click(shutterButton);
    expect(defaultProps.onTakePhoto).toHaveBeenCalled();
  });

  it('adds flying-in animation class when animating to grid', () => {
    render(<CameraView {...defaultProps} isAnimating={true} showPhotoGrid={true} />);
    const container = screen.getByTestId('camera-container');
    expect(container.classList.contains('camera-flying-in')).toBe(true);
  });

  it('adds flying-out animation class when animating from grid', () => {
    render(<CameraView {...defaultProps} isAnimating={true} showPhotoGrid={false} />);
    const container = screen.getByTestId('camera-container');
    expect(container.classList.contains('camera-flying-out')).toBe(true);
  });

  it('hides camera view when photo grid is shown', () => {
    render(<CameraView {...defaultProps} showPhotoGrid={true} isAnimating={false} />);
    const container = screen.getByTestId('camera-container');
    expect(container).toHaveStyle({ display: 'none' });
  });

  it('shows camera view when photo grid is hidden', () => {
    render(<CameraView {...defaultProps} showPhotoGrid={false} isAnimating={false} />);
    const container = screen.getByTestId('camera-container');
    expect(container).not.toHaveStyle({ display: 'none' });
  });

  it('adds ios-fix class to video element on iOS devices', () => {
    const originalUserAgent = window.navigator.userAgent;
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'iPhone',
      configurable: true
    });

    render(<CameraView {...defaultProps} />);
    expect(mockVideoRef.current.classList.contains('ios-fix')).toBe(true);

    // Restore original userAgent
    Object.defineProperty(window.navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true
    });
  });

  it('applies custom testId to container', () => {
    render(<CameraView {...defaultProps} testId="custom-camera" />);
    expect(screen.getByTestId('custom-camera')).toBeInTheDocument();
  });

  it('adds cooldown class to shutter button when disabled', () => {
    render(<CameraView {...defaultProps} isDisabled={true} />);
    expect(screen.getByTestId('shutter-button')).toHaveClass('cooldown');
  });
}); 