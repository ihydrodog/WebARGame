/**
 * 텍스트 힌트
 * 
 * 사용법:
 *   <hint-text value="차가운 곳을 찾아봐!"></hint-text>
 * 
 * 속성:
 *   - value: 힌트 텍스트
 * 
 * 이벤트:
 *   - hint-shown: 힌트 표시 완료 시 발생
 */
import { HintBase } from './hint-base.js';

export class HintText extends HintBase {
  static get observedAttributes() {
    return ['value'];
  }

  render() {
    const value = this.getAttribute('value') || '';
    
    this.shadowRoot.innerHTML = `
      <style>
        ${this.getBaseStyles()}
        
        .hint-text-content {
          font-size: 1.1rem;
          line-height: 1.6;
          color: white;
          text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
          padding: 0.5rem;
          animation: pulse 2s ease-in-out infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
      </style>
      
      <div class="hint-container">
        <p class="hint-text-content">${value}</p>
      </div>
    `;
    
    this.notifyShown();
  }
}

customElements.define('hint-text', HintText);
