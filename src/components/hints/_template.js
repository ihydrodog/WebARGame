/**
 * [컴포넌트명] 힌트
 * 
 * 사용법:
 *   <hint-xxx attribute1="값"></hint-xxx>
 * 
 * 속성:
 *   - attribute1: 설명
 * 
 * 이벤트:
 *   - hint-shown: 힌트 표시 완료 시 발생
 * 
 * AI 개발 체크리스트:
 *   [ ] HintBase 상속
 *   [ ] observedAttributes에 모든 속성 등록
 *   [ ] render() 메서드 구현 (Shadow DOM에 HTML/CSS)
 *   [ ] 로드 완료 시 notifyShown() 호출
 *   [ ] customElements.define() 호출
 *   [ ] index.js에 import 추가
 */
import { HintBase } from './hint-base.js';

export class HintXxx extends HintBase {
  // 1. 감시할 속성 정의
  static get observedAttributes() {
    return ['attribute1'];
  }

  // 2. UI 렌더링
  render() {
    const attr1 = this.getAttribute('attribute1') || '';
    
    this.shadowRoot.innerHTML = `
      <style>
        ${this.getBaseStyles()}
        
        /* 컴포넌트 고유 스타일 */
        .custom-element {
          /* 스타일 정의 */
        }
      </style>
      
      <div class="hint-container">
        <div class="hint-content">
          <!-- 힌트 내용 -->
          ${attr1}
        </div>
      </div>
    `;
    
    // 로드 완료 시 이벤트 발생
    // 비동기 로드가 필요한 경우 (이미지, 비디오 등) onload 후 호출
    this.notifyShown();
  }
}

// 3. 컴포넌트 등록 (주석 해제 후 이름 변경)
// customElements.define('hint-xxx', HintXxx);
