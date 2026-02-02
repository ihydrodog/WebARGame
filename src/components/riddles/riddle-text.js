/**
 * 텍스트 입력 수수께끼
 * 
 * 사용법:
 *   <riddle-text question="7 + 8 = ?" answer="15"></riddle-text>
 * 
 * 속성:
 *   - question: 문제 텍스트
 *   - answer: 정답
 *   - case-sensitive: 대소문자 구분 여부 (기본: false)
 *   - placeholder: 입력창 플레이스홀더
 * 
 * 이벤트:
 *   - answer-submit: { detail: { answer, correct, feedback } }
 */
import { RiddleBase } from './riddle-base.js';

export class RiddleText extends RiddleBase {
  static get observedAttributes() {
    return ['question', 'answer', 'case-sensitive', 'placeholder'];
  }

  render() {
    const question = this.getAttribute('question') || '문제가 없습니다';
    const placeholder = this.getAttribute('placeholder') || '정답을 입력하세요';
    
    this.shadowRoot.innerHTML = `
      <style>
        ${this.getBaseStyles()}
      </style>
      
      <div class="riddle-container">
        <div class="riddle-question">${question}</div>
        <input 
          type="text" 
          class="riddle-input" 
          placeholder="${placeholder}"
          autocomplete="off"
          autocapitalize="off"
        >
        <button class="riddle-submit">제출</button>
      </div>
    `;
    
    const input = this.shadowRoot.querySelector('.riddle-input');
    const submitBtn = this.shadowRoot.querySelector('.riddle-submit');
    
    // 자동 포커스
    setTimeout(() => input.focus(), 100);
    
    submitBtn.addEventListener('click', () => {
      this.submitAnswer(input.value);
    });
    
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.submitAnswer(input.value);
      }
    });
  }

  validate(userAnswer) {
    const answer = this.getAttribute('answer') || '';
    const caseSensitive = this.hasAttribute('case-sensitive');
    
    const normalizedUser = caseSensitive 
      ? userAnswer.trim() 
      : userAnswer.trim().toLowerCase();
    const normalizedAnswer = caseSensitive 
      ? answer.trim() 
      : answer.trim().toLowerCase();
    
    const correct = normalizedUser === normalizedAnswer;
    
    return {
      correct,
      feedback: correct ? '정답이에요! 🎉' : '다시 생각해봐요! 💭'
    };
  }
}

customElements.define('riddle-text', RiddleText);
