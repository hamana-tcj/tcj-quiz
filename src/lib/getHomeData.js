// src/lib/getHomeData.js
'use client';

import { supabase } from '@/lib/supabaseClient';

/**
 * ダッシュボード用の学習状況データを取得する
 *
 * @param {string} userId      supabase auth の user.id
 * @param {string} projectCode URL の [projectCode]（"tcj" など）
 */
export async function getHomeData(userId, projectCode) {
  // 1. 対象プロジェクトのセクション一覧
  const { data: sections, error: secErr } = await supabase
    .from('sections')
    .select('id, name, subject_id, project_code')
    .eq('project_code', projectCode)
    .order('id', { ascending: true }); // 並び順はお好みで

  if (secErr) {
    console.error('sections error:', secErr);
    throw secErr;
  }

  const sectionIds = (sections || []).map((s) => s.id);
  if (sectionIds.length === 0) {
    return { sections: [] };
  }

  // 2. そのセクションに属する問題一覧（件数を数えるため）
  const { data: questions, error: qErr } = await supabase
    .from('questions')
    .select('id, section_id')
    .in('section_id', sectionIds);

  if (qErr) {
    console.error('questions error:', qErr);
    throw qErr;
  }

  const totalBySection = {};
  for (const q of questions || []) {
    if (!totalBySection[q.section_id]) {
      totalBySection[q.section_id] = 0;
    }
    totalBySection[q.section_id] += 1;
  }

  // 3. ユーザーの解答ログ
  const { data: logs, error: logErr } = await supabase
    .from('answer_logs')
    .select('section_id, is_correct')
    .eq('user_id', userId)
    .in('section_id', sectionIds);

  if (logErr) {
    console.error('answer_logs error:', logErr);
    throw logErr;
  }

  const aggBySection = {};
  for (const log of logs || []) {
    const key = log.section_id;
    if (!aggBySection[key]) {
      aggBySection[key] = { answered: 0, correct: 0 };
    }
    aggBySection[key].answered += 1;
    if (log.is_correct) {
      aggBySection[key].correct += 1;
    }
  }

  // 4. セクションごとの進捗を合成
  const sectionsWithProgress = (sections || []).map((sec) => {
    const totals = aggBySection[sec.id] || { answered: 0, correct: 0 };
    const totalQuestions = totalBySection[sec.id] ?? 0;

    return {
      id: sec.id,
      name: sec.name,
      subject_id: sec.subject_id,
      totalQuestions,
      answeredCount: totals.answered,
      correctCount: totals.correct,
    };
  });

  return {
    sections: sectionsWithProgress,
  };
}
