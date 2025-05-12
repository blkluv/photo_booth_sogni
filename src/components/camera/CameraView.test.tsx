import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CameraView } from './CameraView';

describe('CameraView', () => {
  const mockVideoRef = React.createRef<HTMLVideoElement>();
  
  const defaultProps = {
    videoRef: mockVideoRef,
    isReady: true,
    countdown: 0,
    onTakePhoto: jest.fn(),
    selectedStyle: 'watercolor',
    onStyleSelect: jest.fn(),
    showSettings: false,
    onToggleSettings: jest.fn(),
  };

  it('renders correctly with all expected elements', () => {
    render(<CameraView {...defaultProps} />);
    
    // Check for key elements
    expect(screen.getByText('SOGNI PHOTOBOOTH')).toBeInTheDocument();
    expect(screen.getByTestId('webcam-video')).toBeInTheDocument();
    expect(screen.getByTestId('shutter-button')).toBeInTheDocument();
    expect(screen.getByTestId('style-button')).toBeInTheDocument();
    expect(screen.getByTestId('settings-button')).toBeInTheDocument();
  });

  it('shows the correct prompt text with "Prompt:" prefix', () => {
    render(<CameraView {...defaultProps} />);
    
    const styleButton = screen.getByTestId('style-button');
    expect(styleButton.textContent).toContain('Prompt: Watercolor');
  });

  it('opens style dropdown when clicking the style button', () => {
    render(<CameraView {...defaultProps} />);
    
    const styleButton = screen.getByTestId('style-button');
    fireEvent.click(styleButton);
    
    // Check if dropdown opened with featured options
    expect(screen.getByText('Random Mix')).toBeInTheDocument();
    expect(screen.getByText('Random')).toBeInTheDocument();
    expect(screen.getByText('Custom...')).toBeInTheDocument();
  });

  it('shows countdown overlay when countdown > 0', () => {
    render(<CameraView {...defaultProps} countdown={3} />);
    
    expect(screen.getByTestId('countdown')).toBeInTheDocument();
    expect(screen.getByTestId('countdown').textContent).toBe('3');
  });

  it('disables shutter button when isReady is false', () => {
    render(<CameraView {...defaultProps} isReady={false} />);
    
    expect(screen.getByTestId('shutter-button')).toBeDisabled();
  });

  it('disables shutter button when isDisabled is true', () => {
    render(<CameraView {...defaultProps} isDisabled={true} />);
    
    expect(screen.getByTestId('shutter-button')).toBeDisabled();
  });

  it('calls onTakePhoto when clicking the shutter button', () => {
    render(<CameraView {...defaultProps} />);
    
    const button = screen.getByTestId('shutter-button');
    fireEvent.click(button);
    
    expect(defaultProps.onTakePhoto).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleSettings when clicking the settings button', () => {
    render(<CameraView {...defaultProps} />);
    
    const button = screen.getByTestId('settings-button');
    fireEvent.click(button);
    
    expect(defaultProps.onToggleSettings).toHaveBeenCalledTimes(1);
  });

  it('renders the settings button with ⚙️ icon when settings are closed', () => {
    render(<CameraView {...defaultProps} showSettings={false} />);
    
    const settingsButton = screen.getByTestId('settings-button');
    expect(settingsButton.textContent).toBe('⚙️');
  });

  it('renders the settings button with ✕ icon when settings are open', () => {
    render(<CameraView {...defaultProps} showSettings={true} />);
    
    const settingsButton = screen.getByTestId('settings-button');
    expect(settingsButton.textContent).toBe('✕');
  });

  it('calls onStyleSelect with correct style when clicking a style option', () => {
    render(<CameraView {...defaultProps} />);
    
    // Open the dropdown
    const styleButton = screen.getByTestId('style-button');
    fireEvent.click(styleButton);
    
    // Click a style option
    const animeOption = screen.getByText('Anime');
    fireEvent.click(animeOption);
    
    expect(defaultProps.onStyleSelect).toHaveBeenCalledWith('anime');
  });

  // Test for layout - these are basic tests to ensure the structure is maintained
  it('has the polaroid header positioned in the top white border', () => {
    const { container } = render(<CameraView {...defaultProps} />);
    
    // Get the polaroidHeader element
    const polaroidHeader = container.querySelector('[class^="polaroidHeader"]');
    expect(polaroidHeader).toHaveStyle('position: absolute');
    expect(polaroidHeader).toHaveStyle('top: 18px');
    expect(polaroidHeader).toHaveStyle('z-index: 1002');
  });

  it('has the shutter button properly centered', () => {
    const { container } = render(<CameraView {...defaultProps} />);
    
    // Get the shutterButton element
    const shutterButton = container.querySelector('[class^="shutterButton"]');
    expect(shutterButton).toHaveStyle('margin: 0 auto');
  });
}); 