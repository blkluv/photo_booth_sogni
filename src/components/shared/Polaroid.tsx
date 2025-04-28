import React, { ReactNode } from 'react';
import styles from '../../styles/shared/polaroid.module.css';

interface PolaroidProps {
  /** Main content to display in the polaroid frame */
  children: ReactNode;
  /** Optional label to show at the bottom of the frame */
  label?: string;
  /** Optional content to render in the bottom tab area */
  bottomTabContent?: ReactNode;
  /** Optional click handler */
  onClick?: () => void;
  /** Optional additional class name for the frame */
  className?: string;
  /** Optional style overrides for the frame */
  style?: React.CSSProperties;
  /** Optional test ID for testing */
  testId?: string;
}

export const Polaroid: React.FC<PolaroidProps> = ({
  children,
  label,
  bottomTabContent,
  onClick,
  className = '',
  style = {},
  testId,
}) => {
  return (
    <div 
      className={`${styles.polaroidFrame} ${className}`}
      onClick={onClick}
      style={style}
      data-testid={testId}
    >
      <div className={styles.imageContainer}>
        <div className={styles.imageWrapper}>
          {children}
        </div>
        {label && (
          <div className={styles.label}>
            {label}
          </div>
        )}
      </div>
      {bottomTabContent && (
        <div className={styles.bottomTab}>
          {bottomTabContent}
        </div>
      )}
    </div>
  );
};

export default Polaroid; 