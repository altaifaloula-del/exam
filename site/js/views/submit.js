// Final submission: turns the finished exam into the saved result and leaves the exam screen.
import { buildResult } from '../exam-state.js';

export function submitExam(ctx, state, { timeUp = false } = {}) {
  const { store } = ctx;
  const result = buildResult(state, ctx.bank, Date.now(), ctx.essay ? ctx.essay.byId : null);
  store.set('result', result);
  store.set('last', { percent: result.percent, correct: result.correct, total: result.total });
  store.set('wrong', result.missIds);
  store.remove('exam');
  ctx.exitFullscreen();
  ctx.announce(timeUp ? 'انتهى الوقت وسُلِّم الاختبار.' : 'سُلِّم الاختبار.');
  ctx.go('results');
}
