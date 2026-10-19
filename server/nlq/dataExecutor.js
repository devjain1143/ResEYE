import * as dataAccess from '../core/dataAccess.js';

export async function executeIntent(validatedIntent) {
  if (!validatedIntent) {
    throw new Error('executeIntent: missing validatedIntent');
  }

  const { intent, params, confidence } = validatedIntent;

  if (confidence === 'low') {
    return {
      intent,
      lowConfidence: true
    };
  }

  switch (intent) {
    case 'LOOKUP_STUDENT': {
      const identifier = params.identifier || params.scholar_no || params.name;
      const student = await dataAccess.getStudentByIdentifier(identifier);
      return {
        intent,
        identifier,
        student,
        notFound: !student
      };
    }

    case 'TOP_SCORER': {
      const topperData = await dataAccess.getTopScorer(params, params.semester, params.metric, params.position || 'highest', params.limit || 1);
      const isList = Array.isArray(topperData);
      const toppers = isList ? topperData : (topperData ? [topperData] : []);
      return {
        intent,
        batch: params.batch || [params.degree, params.specialization, params.scholar_no_prefix].filter(Boolean).join(' '),
        semester: params.semester,
        metric: params.metric,
        position: params.position || 'highest',
        limit: params.limit || 1,
        topper: isList ? toppers[0] : topperData,
        toppers,
        notFound: toppers.length === 0
      };
    }

    case 'AVERAGE_METRIC': {
      const { average, count } = await dataAccess.getAverageMetric(params, params.semester || null, params.metric);
      return {
        intent,
        batch: params.batch || [params.degree, params.specialization, params.scholar_no_prefix].filter(Boolean).join(' '),
        semester: params.semester || null,
        metric: params.metric,
        average,
        count
      };
    }

    case 'RESULT_COUNT': {
      const counts = await dataAccess.getResultCounts(params, params.semester);
      return {
        intent,
        batch: params.batch || [params.degree, params.specialization, params.scholar_no_prefix].filter(Boolean).join(' '),
        semester: params.semester,
        counts
      };
    }

    case 'BATCH_ROSTER': {
      const { students, total } = await dataAccess.getStudentsByBatch(params);
      return {
        intent,
        batch: params.batch || [params.degree, params.specialization, params.scholar_no_prefix].filter(Boolean).join(' '),
        students,
        count: students.length,
        total
      };
    }

    case 'RANK': {
      const identifier = params.identifier || params.scholar_no || params.name;
      const rankResult = await dataAccess.getRank(identifier, params, params.semester, params.metric);
      return {
        intent,
        identifier,
        batch: params.batch || [params.degree, params.specialization, params.scholar_no_prefix].filter(Boolean).join(' '),
        semester: params.semester,
        metric: params.metric,
        rankResult,
        notFound: !rankResult
      };
    }

    case 'UNSUPPORTED': {
      return {
        intent: 'UNSUPPORTED',
        terminal: true,
        message: "QUERY RESTRICTED: The archive only answers queries regarding student academic records (student lookup, toppers, branch averages, result counts, or roster samples)."
      };
    }

    default:
      throw new Error(`Unknown intent type: ${intent}`);
  }
}
