/**
 * Formats data execution results into clean markdown text without any emojis or Telegram escapes.
 * Strictly adheres to monochrome / analog terminal presentation.
 */

export function formatResponse(result) {
  if (!result) {
    return { text: '[NO SIGNAL] No response available.', data: null };
  }

  if (result.lowConfidence) {
    return {
      text: '**COULD NOT PARSE QUERY**\n\nThe query could not be translated into a known academic pattern. Try querying by branch, semester, or scholar number (e.g., "topper 2nd sem in ece-28" or "average CPI of cse-26").',
      data: result
    };
  }

  switch (result.intent) {
    case 'UNSUPPORTED':
      return {
        text: result.message || '**QUERY RESTRICTED**\n\nThe archive only answers queries regarding student academic records (student lookup, toppers, branch averages, result counts, or roster samples).',
        data: result
      };

    case 'LOOKUP_STUDENT': {
      if (result.notFound || !result.student) {
        return {
          text: `[NOT FOUND] No record found for identifier: ${result.identifier}`,
          data: result
        };
      }
      const s = result.student;
      const lines = [
        `**RECORD FOUND: ${s.scholar_no}**`,
        `Name: ${s.name}`,
        `Degree: ${s.degree || 'B.Tech'}`,
        `Branch: ${s.specialization || 'N/A'}`,
        `Final CPI: ${s.cpi_final !== null && s.cpi_final !== undefined ? s.cpi_final.toFixed(2) : 'N/A'}`
      ];
      return { text: lines.join('\n'), data: result };
    }

    case 'TOP_SCORER': {
      const toppers = result.toppers || (result.topper ? [result.topper] : []);
      if (result.notFound || toppers.length === 0) {
        const semStr = result.semester ? ` in semester ${result.semester}` : '';
        return {
          text: `[NO RECORDS] No academic records found for batch ${result.batch}${semStr}.`,
          data: result
        };
      }

      const metric = (result.metric || 'cpi').toUpperCase();
      const semLine = result.semester ? `Semester ${result.semester} ${metric}` : `Metric: ${metric}`;
      const countStr = toppers.length > 1 ? `Top ${toppers.length} Scorers` : (result.position === 'lowest' ? 'Lowest Scorer' : 'Top Scorer');
      const title = `**${countStr} — ${result.batch?.toUpperCase() || 'BATCH'}**\n${semLine}\n`;

      const lines = [title];
      toppers.forEach((student, idx) => {
        const scoreVal = result.metric === 'spi' ? student[`spi_sem_${result.semester}`] : student.cpi_final;
        const scoreStr = scoreVal !== null && scoreVal !== undefined ? scoreVal.toFixed(2) : 'N/A';
        const prefix = toppers.length > 1 ? `${idx + 1}. ` : '';
        lines.push(
          `${prefix}**${student.name}** | Scholar: \`${student.scholar_no}\` | Branch: ${student.specialization || 'N/A'} | ${metric}: **${scoreStr}**`
        );
      });

      return { text: lines.join('\n'), data: result };
    }

    case 'AVERAGE_METRIC': {
      if (result.count === 0 || result.average === null) {
        return {
          text: `[NO RECORDS] No records found for batch ${result.batch}.`,
          data: result
        };
      }
      const metric = (result.metric || 'cpi').toUpperCase();
      const semLine = result.semester ? `Semester: ${result.semester}\n` : '';
      const text = [
        `**AVERAGE ${metric} — ${result.batch?.toUpperCase() || 'BATCH'}**`,
        semLine.trim(),
        `Average ${metric}: **${result.average.toFixed(2)}**`,
        `Computed across: **${result.count}** students`
      ].filter(Boolean).join('\n');

      return { text, data: result };
    }

    case 'RESULT_COUNT': {
      const { pass, fail, withheld, total } = result.counts || {};
      if (total === 0) {
        return {
          text: `[NO RECORDS] No results recorded for batch ${result.batch} in semester ${result.semester}.`,
          data: result
        };
      }

      const lines = [
        `**RESULT BREAKDOWN — ${result.batch?.toUpperCase() || 'BATCH'}**`,
        `Semester: ${result.semester}`,
        '',
        `Pass: **${pass}**`,
        `Fail: **${fail}**`
      ];

      if (withheld > 0) {
        lines.push(`Withheld: **${withheld}**`);
      }

      if (total > 0) {
        const passRate = ((pass / total) * 100).toFixed(1);
        lines.push(`Pass Rate: **${passRate}%**`);
      }

      lines.push(`Total Cohort: **${total}**`);
      return { text: lines.join('\n'), data: result };
    }

    case 'BATCH_ROSTER': {
      if (result.count === 0) {
        return {
          text: `[NO RECORDS] No students found for batch ${result.batch}.`,
          data: result
        };
      }

      const displayList = (result.students || []).slice(0, 5);
      const rows = displayList.map((s, idx) =>
        `${idx + 1}. \`${s.scholar_no}\` — ${s.name} (${s.specialization || 'N/A'})`
      );

      const totalCount = result.total || result.count;
      const header = `**BATCH ROSTER — ${result.batch?.toUpperCase() || 'BATCH'}** (Showing first 5 of ${totalCount} records)\n`;
      const body = rows.join('\n');
      const footer = `\n\n*Security notice: Student rosters are strictly restricted to 5 records per query.*`;

      return { text: header + '\n' + body + footer, data: result };
    }

    case 'RANK': {
      if (result.notFound || !result.rankResult) {
        return {
          text: `[NOT FOUND] Could not compute rank for student ${result.identifier} in batch ${result.batch}.`,
          data: result
        };
      }
      const { rank, total, score, student } = result.rankResult;
      const metric = (result.metric || 'cpi').toUpperCase();
      const semTag = result.semester ? ` (Sem ${result.semester})` : '';

      const lines = [
        `**COHORT RANKING — ${result.batch?.toUpperCase() || 'BATCH'}**`,
        `Student: **${student.name}**`,
        `Scholar No: \`${student.scholar_no}\``,
        `Rank: **#${rank}** of **${total}** students`,
        `Score (${metric}${semTag}): **${score !== null && score !== undefined ? score.toFixed(2) : 'N/A'}**`
      ];

      return { text: lines.join('\n'), data: result };
    }

    default:
      return { text: '[FAULT] Unrecognized execution result.', data: result };
  }
}
