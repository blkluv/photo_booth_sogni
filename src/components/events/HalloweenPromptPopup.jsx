import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import '../../styles/events/HalloweenPromptPopup.css';

/**
 * HalloweenPromptPopup - Halloween-themed version of CustomPromptPopup for costume submissions
 */
const HalloweenPromptPopup = ({ 
  isOpen, 
  onClose, 
  onApply,
  currentPrompt = ''
}) => {
  const [promptText, setPromptText] = useState(currentPrompt);
  const [showSparkles, setShowSparkles] = useState(false);
  const textareaRef = useRef(null);
  const popupRef = useRef(null);

  // Halloween-themed placeholder examples
  const halloweenPlaceholders = [
    "as a vampire in a gothic castle with candelabras 🧛‍♀️🕯️",
    "dressed as a witch brewing a glowing potion 🧙‍♀️✨",
    "as a zombie apocalypse survivor in a haunted city 🧟‍♂️🌃",
    "wearing a Day of the Dead skull makeup with marigolds 💀🌼",
    "as a werewolf howling at a full moon in misty forest 🐺🌕",
    "dressed as a steampunk ghost hunter with Victorian gear 👻⚙️",
    "as a mummy emerging from ancient Egyptian tomb 🏺✨",
    "wearing a creepy vintage porcelain doll costume 🎎👁️"
  ];
  const [currentPlaceholder, setCurrentPlaceholder] = useState(halloweenPlaceholders[0]);

  // Auto-focus the textarea when the popup opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }, 100);
      // Rotate placeholder examples
      const placeholderInterval = setInterval(() => {
        setCurrentPlaceholder(prev => {
          const currentIndex = halloweenPlaceholders.indexOf(prev);
          const nextIndex = (currentIndex + 1) % halloweenPlaceholders.length;
          return halloweenPlaceholders[nextIndex];
        });
      }, 4000);
      return () => clearInterval(placeholderInterval);
    }
  }, [isOpen]);

  // Update local state when currentPrompt prop changes
  useEffect(() => {
    setPromptText(currentPrompt);
  }, [currentPrompt]);

  // Handle click outside to close
  useEffect(() => {
    if (isOpen) {
      const handleClickOutside = (e) => {
        if (popupRef.current && !popupRef.current.contains(e.target)) {
          onClose();
        }
      };
      
      // Add a small delay to prevent immediate closing when opening
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          onClose();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          // Ctrl+Enter or Cmd+Enter to apply
          handleApply();
        }
      };
      
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, promptText, onClose]);

  const handleApply = () => {
    onApply(promptText);
    onClose();
  };

  const handleCancel = () => {
    setPromptText(currentPrompt); // Reset to original
    onClose();
  };

  const handleTextChange = (e) => {
    setPromptText(e.target.value);
    // Show sparkles when typing
    setShowSparkles(true);
    setTimeout(() => setShowSparkles(false), 500);
  };

  // Get spooky encouraging message based on character count
  const getEncouragingMessage = () => {
    const length = promptText.length;
    if (length === 0) return "👻 Time to get spooky!";
    if (length < 20) return "🎃 Keep going, getting creepier!";
    if (length < 50) return "🕷️ Nice! Add more spooky details!";
    if (length < 100) return "🧙‍♀️ Wow! This is getting frightfully good!";
    if (length < 200) return "🦇 Amazing detail! This will be scary good!";
    return "💀 You're a Halloween master! ✨";
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="halloween-prompt-overlay">
      <div className="halloween-prompt-popup" ref={popupRef}>
        {/* Floating Halloween decorations */}
        <div className="halloween-sparkles-container">
          <span className="halloween-sparkle sparkle-1">🎃</span>
          <span className="halloween-sparkle sparkle-2">👻</span>
          <span className="halloween-sparkle sparkle-3">🦇</span>
          <span className="halloween-sparkle sparkle-4">🕷️</span>
        </div>

        <div className="halloween-prompt-header">
          <h3>
            <span className="header-emoji">🎃</span>
            Create Your Costume!
            <span className="header-emoji">👻</span>
          </h3>
          <button 
            className="halloween-prompt-close"
            onClick={handleCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="halloween-prompt-body">
          <label className="halloween-prompt-label">
            🎨 Describe your spooky costume vision:
          </label>
          <div className="textarea-wrapper">
            <textarea
              ref={textareaRef}
              className={`halloween-prompt-textarea ${showSparkles ? 'typing-sparkle' : ''}`}
              placeholder={currentPlaceholder}
              value={promptText}
              onChange={handleTextChange}
              rows={5}
              autoComplete="off"
              autoCapitalize="off"
              data-form-type="other"
            />
            {showSparkles && <div className="typing-sparkles">✨</div>}
          </div>

          <div className="prompt-stats">
            <div className="encouraging-message">
              {getEncouragingMessage()}
            </div>
            <div className="character-count">
              {promptText.length} characters
            </div>
          </div>
        </div>

        <div className="halloween-prompt-footer">
          <button 
            className="halloween-prompt-btn halloween-prompt-btn-cancel"
            onClick={handleCancel}
          >
            Not Yet 🦇
          </button>
          <button 
            className="halloween-prompt-btn halloween-prompt-btn-apply"
            onClick={handleApply}
            disabled={!promptText.trim()}
          >
            Summon the Magic 🎃✨
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

HalloweenPromptPopup.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onApply: PropTypes.func.isRequired,
  currentPrompt: PropTypes.string
};

export default HalloweenPromptPopup;

