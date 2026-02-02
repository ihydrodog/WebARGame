/**
 * 이미지 힌트
 * 
 * 사용법:
 *   <hint-image src="/img/fridge.png" alt="힌트 이미지"></hint-image>
 * 
 * 속성:
 *   - src: 이미지 URL 또는 Base64
 *   - alt: 대체 텍스트
 *   - width: 이미지 너비 (선택)
 *   - height: 이미지 높이 (선택)
 * 
 * 이벤트:
 *   - hint-shown: 이미지 로드 완료 시 발생
 */
import { HintBase } from './hint-base.js';

export class HintImage extends HintBase {
  static get observedAttributes() {
    return ['src', 'alt', 'width', 'height'];
  }

  render() {
    const src = this.getAttribute('src') || '';
    const alt = this.getAttribute('alt') || '힌트 이미지';
    const width = this.getAttribute('width');
    const height = this.getAttribute('height');
    
    let styleAttr = 'max-width: 100%;';
    if (width) styleAttr += ` width: ${width}px;`;
    if (height) styleAttr += ` height: ${height}px;`;
    
    this.shadowRoot.innerHTML = `
      <style>
        ${this.getBaseStyles()}
        
        .hint-image-container {
          text-align: center;
        }
        
        .hint-image {
          max-width: 100%;
          max-height: 200px;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
          animation: fadeIn 0.5s ease;
        }
        
        .hint-image-loading {
          padding: 2rem;
          color: white;
          opacity: 0.7;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      </style>
      
      <div class="hint-container hint-image-container">
        ${src ? `
          <img 
            class="hint-image" 
            src="${src}" 
            alt="${alt}"
            style="${styleAttr}"
          >
        ` : `
          <div class="hint-image-loading">이미지 로딩 중...</div>
        `}
      </div>
    `;
    
    if (src) {
      const img = this.shadowRoot.querySelector('.hint-image');
      img.onload = () => this.notifyShown();
      img.onerror = () => {
        img.style.display = 'none';
        this.notifyShown();
      };
    } else {
      this.notifyShown();
    }
  }
}

customElements.define('hint-image', HintImage);
