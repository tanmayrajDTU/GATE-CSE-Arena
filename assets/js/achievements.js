/* ============================================================
   ACHIEVEMENTS — definitions + evaluation.
   Each achievement's `check(stats)` reads a plain stats snapshot
   (see snapshot()) and returns true/false. Evaluation is re-run
   after every submitted test; newly-true achievements are unlocked
   once and never re-evaluated as locked again.
   ============================================================ */

const ACHIEVEMENTS = (() => {
  const LIST = [
    { id: "first-step", name: "First Step", desc: "Answer your first question.", icon: "🎯", category: "Milestones",
      check: s => s.totals.attempted >= 1 },
    { id: "half-century", name: "Half Century", desc: "Answer 50 questions.", icon: "🥉", category: "Milestones",
      check: s => s.totals.attempted >= 50 },
    { id: "century", name: "Century", desc: "Answer 100 questions.", icon: "🥈", category: "Milestones",
      check: s => s.totals.attempted >= 100 },
    { id: "five-hundred", name: "Five Hundred", desc: "Answer 500 questions.", icon: "🥇", category: "Milestones",
      check: s => s.totals.attempted >= 500 },
    { id: "thousand-club", name: "Thousand Club", desc: "Answer 1,000 questions.", icon: "🏆", category: "Milestones",
      check: s => s.totals.attempted >= 1000 },
    { id: "marathon", name: "Marathon", desc: "Complete a single test with 50 or more questions.", icon: "🏃", category: "Milestones",
      check: s => s.history.some(r => r.total >= 50) },

    { id: "perfectionist", name: "Perfectionist", desc: "Score 100% on a test of at least 10 questions.", icon: "💎", category: "Accuracy",
      check: s => s.history.some(r => r.total >= 10 && r.wrong === 0 && r.skipped === 0 && r.correct === r.total) },
    { id: "sharpshooter", name: "Sharpshooter", desc: "Reach 80% overall accuracy across at least 100 attempts.", icon: "🎯", category: "Accuracy",
      check: s => s.totals.attempted >= 100 && (s.totals.correct / s.totals.attempted) >= 0.8 },
    { id: "subject-master", name: "Subject Master", desc: "Reach 90% accuracy in any one subject, 30+ attempts there.", icon: "📘", category: "Accuracy",
      check: s => Object.values(s.subjectStats).some(v => v.attempted >= 30 && (v.correct / v.attempted) >= 0.9) },

    { id: "streak-3", name: "Warming Up", desc: "3-day practice streak.", icon: "🔥", category: "Streaks",
      check: s => s.streak.longest >= 3 },
    { id: "streak-7", name: "One Week In", desc: "7-day practice streak.", icon: "🔥", category: "Streaks",
      check: s => s.streak.longest >= 7 },
    { id: "streak-30", name: "Unstoppable", desc: "30-day practice streak.", icon: "🔥", category: "Streaks",
      check: s => s.streak.longest >= 30 },

    { id: "msq-master", name: "MSQ Master", desc: "Get 25 multi-select questions correct.", icon: "☑️", category: "Type specific",
      check: s => (s.typeStats.MSQ?.correct || 0) >= 25 },
    { id: "nat-ninja", name: "NAT Ninja", desc: "Get 25 numeric-answer questions correct.", icon: "🔢", category: "Type specific",
      check: s => (s.typeStats.NAT?.correct || 0) >= 25 },
  ];

  function snapshot() {
    return {
      totals: STATE.getTotals(),
      subjectStats: STATE.getSubjectStats(),
      typeStats: STATE.getTypeStats(),
      streak: STATE.getStreak(),
      history: STATE.getHistory(),
      points: STATE.getPoints(),
    };
  }

  // Re-check everything, unlock any newly-earned ones, return their defs.
  function evaluateAndUnlock() {
    const s = snapshot();
    const unlocked = STATE.getUnlockedAchievements();
    const newlyTrueIds = LIST.filter(a => !unlocked[a.id] && a.check(s)).map(a => a.id);
    const confirmed = STATE.unlockAchievements(newlyTrueIds);
    return LIST.filter(a => confirmed.includes(a.id));
  }

  function all() { return LIST; }
  function unlockedStatus() {
    const unlocked = STATE.getUnlockedAchievements();
    return LIST.map(a => ({ ...a, unlocked: !!unlocked[a.id], unlockedAt: unlocked[a.id] || null }));
  }

  return { all, unlockedStatus, evaluateAndUnlock, snapshot };
})();
