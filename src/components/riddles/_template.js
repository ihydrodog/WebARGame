/**
 * [컴포넌트명] 수수께끼
 * 
 * 사용법:
 *   <riddle-xxx attribute1="값" attribute2="값"></riddle-xxx>
 * 
 * 속성:
 *   - attribute1: 설명
 *   - attribute2: 설명
 * 
 * 이벤트:
 *   - answer-submit: { detail: { answer, correct, feedback } }
 * 
 * AI 개발 체크리스트:
 *   [ ] RiddleBase 상속
 *   [ ] observedAttributes에 모든 속성 등록
 *   [ ] render() 메서드 구현 (Shadow DOM에 HTML/CSS)
 *   [ ] validate() 메서드 구현 ({ correct, feedback } 반환)
 *   [ ] customElements.define() 호출
 *   [ ] index.js에 import 추가
 */
import { RiddleBase } from './riddle-base.js';

export class RiddleXxx extends RiddleBase {
  // 1. 감시할 속성 정의
  static get observedAttributes() {
    return ['attribute1', 'attribute2', 'answer'];
  }

  // 2. UI 렌더링
  render() {
    const attr1 = this.getAttribute('attribute1') || '';
    const attr2 = this.getAttribute('attribute2') || '';
    
    this.shadowRoot.innerHTML = `
      <style>
        ${this.getBaseStyles()}
        
        /* 컴포넌트 고유 스타일 */
        .custom-element {
          /* 스타일 정의 */
        }
      </style>
      
      <div class="riddle-container">
        <div class="riddle-question">${attr1}</div>
        
        <!-- 입력 UI -->
        <input type="text" class="riddle-input" placeholder="정답을 입력하세요">
        
        <!-- 제출 버튼 -->
        <button class="riddle-submit">제출</button>
      </div>
    `;
    
    // 이벤트 바인딩
    const input = this.shadowRoot.querySelector('.riddle-input');
    const submitBtn = this.shadowRoot.querySelector('.riddle-submit');
    
    submitBtn.addEventListener('click', () => {
      this.submitAnswer(input.value);
    });
    
    // 엔터키로 제출
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.submitAnswer(input.value);
      }
    });
  }

  // 3. 정답 검증 로직
  validate(userAnswer) {
    const correctAnswer = this.getAttribute('answer') || '';
    
    // 정규화 (공백 제거, 소문자 변환)
    const normalized = userAnswer.trim().toLowerCase();
    const expected = correctAnswer.trim().toLowerCase();
    
    const correct = normalized === expected;
    
    return {
      correct,
      feedback: correct ? '정답이에요! 🎉' : '다시 생각해봐요! 💭'
    };
  }
}

// 4. 컴포넌트 등록 (주석 해제 후 이름 변경)
// customElements.define('riddle-xxx', RiddleXxx);
