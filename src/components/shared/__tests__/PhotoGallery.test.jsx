import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import PhotoGallery from '../PhotoGallery';

// Mock requestAnimationFrame and getBoundingClientRect
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.scrollTo = jest.fn();

const mockRect = { 
  top: 100, 
  left: 100, 
  width: 200, 
  height: 200, 
  right: 300, 
  bottom: 300 
};

// Mock getBoundingClientRect
Element.prototype.getBoundingClientRect = jest.fn(() => mockRect);

// Mock photos data
const mockPhotos = [
  {
    id: 'original-123',
    images: ['original-url.jpg'],
    originalDataUrl: 'original-dataurl.jpg',
    isOriginal: true,
  },
  {
    id: 'photo-1',
    images: ['photo1-url.jpg'],
    originalDataUrl: 'photo1-dataurl.jpg',
  },
  {
    id: 'loading-photo',
    images: [],
    loading: true,
    originalDataUrl: 'loading-dataurl.jpg',
    progress: 45,
  },
  {
    id: 'error-photo',
    images: [],
    error: 'Generation failed',
    originalDataUrl: 'error-dataurl.jpg',
  }
];

describe('PhotoGallery Component', () => {
  const defaultProps = {
    photos: mockPhotos,
    selectedPhotoIndex: null,
    setSelectedPhotoIndex: jest.fn(),
    showPhotoGrid: true,
    handleBackToCamera: jest.fn(),
    goToPreviousPhoto: jest.fn(),
    goToNextPhoto: jest.fn(),
    keepOriginalPhoto: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    Element.prototype.offsetHeight = 1000; // Mock offsetHeight for forcing reflow
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders nothing when photos is empty', () => {
    const { container } = render(
      <PhotoGallery {...defaultProps} photos={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when showPhotoGrid is false', () => {
    const { container } = render(
      <PhotoGallery {...defaultProps} showPhotoGrid={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the back to camera button', () => {
    render(<PhotoGallery {...defaultProps} />);
    const backButton = screen.getByText('← Back to Camera');
    expect(backButton).toBeInTheDocument();
    
    fireEvent.click(backButton);
    expect(defaultProps.handleBackToCamera).toHaveBeenCalledTimes(1);
  });

  it('renders all photos correctly', () => {
    render(<PhotoGallery {...defaultProps} />);
    
    // Check reference photo renders
    expect(screen.getByText('Reference')).toBeInTheDocument();
    
    // Check normal photo renders 
    expect(screen.getByText('#1')).toBeInTheDocument();
    
    // Check loading photo renders with progress
    expect(screen.getByText('45%')).toBeInTheDocument();
    
    // Check error photo renders with error message
    expect(screen.getByText('Error: Generation failed')).toBeInTheDocument();
  });

  it('handles photo selection correctly', () => {
    render(<PhotoGallery {...defaultProps} />);
    
    // Find the first non-reference photo
    const photoElement = screen.getByText('#1').closest('.film-frame');
    
    // Select the photo
    fireEvent.click(photoElement);
    
    // Verify selection function called with correct index
    expect(defaultProps.setSelectedPhotoIndex).toHaveBeenCalledWith(1);
    
    // Verify smooth scroll to top
    expect(global.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    
    // Fast-forward animations
    act(() => {
      jest.runAllTimers();
    });
  });

  it('displays navigation buttons when a photo is selected', () => {
    render(<PhotoGallery {...defaultProps} selectedPhotoIndex={1} />);
    
    // Navigation buttons should be visible
    const prevButton = screen.getByText('‹');
    const nextButton = screen.getByText('›');
    
    expect(prevButton).toBeInTheDocument();
    expect(nextButton).toBeInTheDocument();
    
    // Test navigation
    fireEvent.click(prevButton);
    expect(defaultProps.goToPreviousPhoto).toHaveBeenCalledTimes(1);
    
    fireEvent.click(nextButton);
    expect(defaultProps.goToNextPhoto).toHaveBeenCalledTimes(1);
  });

  it('does not show navigation buttons with only one photo', () => {
    const singlePhoto = [mockPhotos[0]];
    render(<PhotoGallery {...defaultProps} photos={singlePhoto} selectedPhotoIndex={0} />);
    
    // Nav buttons should not be present
    expect(screen.queryByText('‹')).not.toBeInTheDocument();
    expect(screen.queryByText('›')).not.toBeInTheDocument();
  });

  it('deselects a photo when clicking on the selected photo', () => {
    // Setup with already selected photo
    const { rerender } = render(
      <PhotoGallery {...defaultProps} selectedPhotoIndex={1} />
    );
    
    // Get selected photo
    const selectedPhoto = screen.getByText('#1').closest('.film-frame');
    expect(selectedPhoto).toHaveClass('selected');
    
    // Click to deselect
    fireEvent.click(selectedPhoto);
    
    // Verify deselection
    expect(defaultProps.setSelectedPhotoIndex).toHaveBeenCalledWith(null);
    
    // Fast-forward animations
    act(() => {
      jest.runAllTimers();
    });
    
    // Check animation cleanup occurred
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 500);
  });

  it('applies correct CSS classes and styling during selection state', () => {
    const { rerender } = render(<PhotoGallery {...defaultProps} />);
    
    // Initially no selected class on container
    const container = screen.getByRole('button', { name: /back to camera/i }).parentElement;
    expect(container).not.toHaveClass('has-selected');
    
    // Rerender with selection
    rerender(<PhotoGallery {...defaultProps} selectedPhotoIndex={1} />);
    
    // Check has-selected class added
    expect(container).toHaveClass('has-selected');
    
    // Check the film-strip-content also has selected class
    const filmStripContent = screen.getByText('#1').closest('.film-strip-content');
    expect(filmStripContent).toHaveClass('has-selected');
  });

  it('handles loading photos correctly', () => {
    render(<PhotoGallery {...defaultProps} />);
    
    // Find loading photo
    const loadingPhoto = screen.getByText('45%').closest('.film-frame');
    expect(loadingPhoto).toHaveClass('loading');
    
    // Check placeholder image exists
    const placeholderImg = loadingPhoto.querySelector('img.placeholder');
    expect(placeholderImg).toBeInTheDocument();
    expect(placeholderImg).toHaveAttribute('src', 'loading-dataurl.jpg');
  });

  it('handles error photos correctly', () => {
    render(<PhotoGallery {...defaultProps} />);
    
    // Find error photo
    const errorLabel = screen.getByText('Error: Generation failed');
    const errorPhoto = errorLabel.closest('.film-frame');
    
    expect(errorPhoto).toHaveClass('loading');
    expect(errorLabel).toHaveStyle({ color: '#d32f2f', fontWeight: 700 });
    
    // Check placeholder image with dimmed opacity
    const placeholderImg = errorPhoto.querySelector('img.placeholder');
    expect(placeholderImg).toBeInTheDocument();
    expect(placeholderImg).toHaveStyle({ opacity: 0.2 });
  });

  it('applies correct rotation based on index', () => {
    render(<PhotoGallery {...defaultProps} />);
    
    // Check first photo (index 0) rotation
    const firstPhoto = screen.getByText('Reference').closest('.film-frame');
    expect(firstPhoto.style.getPropertyValue('--rotation')).toBe('0.8deg');
    
    // Check second photo (index 1) rotation
    const secondPhoto = screen.getByText('#1').closest('.film-frame');
    expect(secondPhoto.style.getPropertyValue('--rotation')).toBe('-1.3deg');
  });

  it('handles click on loading/error photos correctly', () => {
    render(<PhotoGallery {...defaultProps} />);
    
    // Find loading photo and click
    const loadingPhoto = screen.getByText('45%').closest('.film-frame');
    fireEvent.click(loadingPhoto);
    
    // Should set selected index
    expect(defaultProps.setSelectedPhotoIndex).toHaveBeenCalledWith(2);
    
    // Reset and try error photo
    defaultProps.setSelectedPhotoIndex.mockClear();
    
    const errorPhoto = screen.getByText('Error: Generation failed').closest('.film-frame');
    fireEvent.click(errorPhoto);
    
    // Should set selected index
    expect(defaultProps.setSelectedPhotoIndex).toHaveBeenCalledWith(3);
  });

  it('adjusts number label based on keepOriginalPhoto setting', () => {
    // First with keepOriginalPhoto = true (default)
    const { rerender } = render(<PhotoGallery {...defaultProps} />);
    
    // First non-reference photo should be #1
    expect(screen.getByText('#1')).toBeInTheDocument();
    
    // Now with keepOriginalPhoto = false
    rerender(<PhotoGallery {...defaultProps} keepOriginalPhoto={false} />);
    
    // First photo should now be #2 (original is 0, non-reference starts at 0 but +1 for display)
    expect(screen.getByText('#2')).toBeInTheDocument();
  });
});