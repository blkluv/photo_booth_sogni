import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSogniAuth } from '../../services/sogniAuth';

interface ReferralSharePopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReferralSharePopup: React.FC<ReferralSharePopupProps> = ({ isOpen, onClose }) => {
  const { user } = useSogniAuth();
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const referralUrl = user?.username
    ? `https://photobooth.sogni.ai/?code=${encodeURIComponent(user.username)}`
    : '';

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopy = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[REFERRAL] Failed to copy:', err);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="referral-popup-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
    >
      <div
        ref={panelRef}
        style={{
          background: '#FFED4E',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '380px',
          margin: '0 16px',
          border: '4px solid #1a1a1a',
          boxShadow: '8px 8px 0 #1a1a1a',
          overflow: 'hidden',
          animation: 'menuFadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 20px 16px',
            textAlign: 'center',
            borderBottom: '3px dashed rgba(26, 26, 26, 0.15)',
          }}
        >
          <div style={{ fontSize: '1.75rem', marginBottom: '4px' }}>&#x2728;</div>
          <h2
            id="referral-popup-title"
            style={{
              fontSize: '1.1rem',
              fontWeight: 900,
              color: '#1a1a1a',
              margin: 0,
              textTransform: 'lowercase',
              letterSpacing: '-0.01em',
            }}
          >
            share &amp; earn
          </h2>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px' }}>
          <p
            style={{
              fontSize: '0.8125rem',
              lineHeight: 1.6,
              color: '#1a1a1a',
              margin: '0 0 6px',
              textAlign: 'center',
            }}
          >
            Share <strong>photobooth.sogni.ai</strong> and earn render credits!
          </p>

          <ul
            style={{
              fontSize: '0.75rem',
              lineHeight: 1.7,
              color: 'rgba(26, 26, 26, 0.8)',
              margin: '0 0 16px',
              paddingLeft: '18px',
            }}
          >
            <li>
              Friends who sign up get <strong style={{ color: '#1a1a1a' }}>25 bonus credits</strong>
            </li>
            <li>
              You earn a bonus on every credit purchase they make
            </li>
          </ul>

          {/* Referral link */}
          <label
            style={{
              display: 'block',
              fontSize: '0.625rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(26, 26, 26, 0.5)',
              marginBottom: '6px',
            }}
          >
            Your referral link
          </label>
          <div
            style={{
              display: 'flex',
              gap: '6px',
              alignItems: 'stretch',
            }}
          >
            <input
              type="text"
              readOnly
              value={referralUrl}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: '50px',
                border: '3px solid #1a1a1a',
                background: '#ffffff',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#1a1a1a',
                outline: 'none',
                minWidth: 0,
              }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={() => { void handleCopy(); }}
              style={{
                padding: '10px 18px',
                borderRadius: '50px',
                background: copied ? '#22c55e' : '#1a1a1a',
                color: '#ffffff',
                border: '3px solid #1a1a1a',
                fontSize: '0.8125rem',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                textTransform: 'lowercase',
                boxShadow: copied ? 'none' : '2px 2px 0 rgba(26, 26, 26, 0.3)',
              }}
            >
              {copied ? 'copied!' : 'copy'}
            </button>
          </div>

          {/* Learn more link */}
          <div style={{ marginTop: '14px', textAlign: 'center' }}>
            <a
              href="https://docs.sogni.ai/rewards/referral-program-sogni-ambassador-rewards"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#1a1a1a',
                textDecoration: 'underline',
                textDecorationColor: 'rgba(26, 26, 26, 0.3)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = '#1a1a1a')}
              onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = 'rgba(26, 26, 26, 0.3)')}
            >
              learn about the referral program &rarr;
            </a>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 20px 16px',
            textAlign: 'center',
          }}
        >
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#1a1a1a',
              cursor: 'pointer',
              padding: '4px 8px',
              fontSize: '0.6875rem',
              fontWeight: 600,
              opacity: 0.5,
              textDecoration: 'underline',
              textDecorationColor: 'rgba(26, 26, 26, 0.3)',
              textTransform: 'lowercase',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.5';
            }}
          >
            close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
