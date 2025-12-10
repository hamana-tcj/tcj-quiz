/**
 * kintone API連携用クライアント
 * 
 * 環境変数:
 * - KINTONE_SUBDOMAIN: kintoneのサブドメイン
 * - KINTONE_API_TOKEN: kintone APIトークン
 * - KINTONE_APP_ID: アプリID
 */

const KINTONE_SUBDOMAIN = process.env.KINTONE_SUBDOMAIN;
const KINTONE_API_TOKEN = process.env.KINTONE_API_TOKEN;
const KINTONE_APP_ID = process.env.KINTONE_APP_ID;

if (!KINTONE_SUBDOMAIN || !KINTONE_API_TOKEN || !KINTONE_APP_ID) {
  console.warn('kintone環境変数が設定されていません');
}

const KINTONE_BASE_URL = `https://${KINTONE_SUBDOMAIN}.cybozu.com`;

/**
 * kintoneからレコードを取得
 * @param {Object} options - 取得オプション
 * @param {number} options.limit - 取得件数（デフォルト: 500、最大: 500）
 * @param {number} options.offset - オフセット（デフォルト: 0、最大: 10000）
 * @param {string} options.query - クエリ文字列（オプション）
 * @param {number} options.minRecordId - 最小レコードID（offsetの代替として使用）
 * @returns {Promise<Array>} レコード配列
 */
export async function getKintoneRecords({ limit = 500, offset = 0, query = '', minRecordId = null } = {}) {
  if (!KINTONE_SUBDOMAIN || !KINTONE_API_TOKEN || !KINTONE_APP_ID) {
    throw new Error('kintone環境変数が設定されていません');
  }

  const url = `${KINTONE_BASE_URL}/k/v1/records.json`;
  
  // パラメータを構築
  // アプリIDは数値として送信（kintone APIの要件）
  const appId = Number(KINTONE_APP_ID);
  if (isNaN(appId)) {
    throw new Error(`無効なアプリID: ${KINTONE_APP_ID}`);
  }
  
  // kintone APIの正しい形式: appパラメータは必須、queryはオプション
  const params = new URLSearchParams();
  params.append('app', String(appId));
  
  // kintone APIの制限: offsetは最大10,000件まで
  // offsetが10,000を超える場合は、レコードIDを基準にした取得方法に切り替える
  if (offset > 10000) {
    console.warn(`⚠️ offset=${offset}が10,000を超えています。レコードIDベースの取得に切り替えます。`);
    if (minRecordId) {
      // レコードIDベースの取得
      query = query || '';
      const recordIdQuery = minRecordId ? `$id > ${minRecordId} and (${query || '1=1'})` : query;
      query = recordIdQuery;
      offset = 0; // offsetは使用しない
    } else {
      throw new Error(`offset=${offset}が10,000を超えています。minRecordIdを指定するか、別の方法で取得してください。`);
    }
  }

  // クエリ文字列を構築
  // kintone APIでは、クエリが空の場合は全件取得される
  // limit/offsetを使う場合は、クエリに含める必要がある
  let queryString = query;
  if (!queryString || queryString.trim() === '') {
    // デフォルトクエリ: レコードIDでソートしてlimitとoffsetを指定
    // kintone APIのクエリ構文では、order by句が必要な場合がある
    // ただし、$idフィールドは常に存在するため、これを使用
    if (minRecordId) {
      queryString = `$id > ${minRecordId} order by $id asc limit ${limit}`;
    } else {
      queryString = `order by $id asc limit ${limit} offset ${offset}`;
    }
  } else {
    // 既存のクエリにlimitとoffsetを追加（まだ含まれていない場合）
    const hasLimit = /limit\s+\d+/i.test(queryString);
    const hasOffset = /offset\s+\d+/i.test(queryString);
    
    if (!hasLimit) {
      queryString += ` limit ${limit}`;
    }
    if (!hasOffset && !minRecordId) {
      queryString += ` offset ${offset}`;
    }
  }
  
  // クエリを追加（kintone APIでは、クエリが空の場合は省略可能だが、
  // limit/offsetを使う場合は必須）
  params.append('query', queryString);

  // デバッグ用: リクエストURLをログ出力（本番環境では削除推奨）
  const requestUrl = `${url}?${params.toString()}`;
  console.log('kintone API リクエスト:', {
    url: requestUrl.replace(KINTONE_API_TOKEN, '***'),
    app: KINTONE_APP_ID,
    appIdType: typeof appId,
    query: queryString,
    subdomain: KINTONE_SUBDOMAIN,
    tokenLength: KINTONE_API_TOKEN ? KINTONE_API_TOKEN.length : 0,
    tokenPrefix: KINTONE_API_TOKEN ? KINTONE_API_TOKEN.substring(0, 10) + '...' : 'none',
  });

  try {
    // kintone REST APIのGETリクエストでは、Content-Typeヘッダーは不要
    // X-Cybozu-API-Tokenのみが必要
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        'X-Cybozu-API-Token': KINTONE_API_TOKEN,
      },
    });
    
    // レスポンスの詳細をログ出力
    console.log('kintone API レスポンス:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `kintone API エラー: ${response.status} - ${errorText}`;
      
      // エラーの詳細を追加
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage += ` (${errorJson.message})`;
        }
        if (errorJson.code) {
          errorMessage += ` [コード: ${errorJson.code}]`;
        }
      } catch (e) {
        // JSONパースに失敗した場合はそのまま
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.records || [];
  } catch (error) {
    console.error('kintoneレコード取得エラー:', error);
    console.error('リクエスト詳細:', {
      url: requestUrl.replace(KINTONE_API_TOKEN, '***'),
      app: KINTONE_APP_ID,
      query: queryString,
    });
    throw error;
  }
}

/**
 * kintoneから全レコードを取得（ページネーション対応）
 * @param {Object} options - 取得オプション
 * @param {string} options.query - クエリ文字列（オプション）
 * @param {number} options.batchSize - 1回あたりの取得件数（デフォルト: 500）
 * @returns {Promise<Array>} 全レコード配列
 */
export async function getAllKintoneRecords({ query = '', batchSize = 500 } = {}) {
  const allRecords = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const records = await getKintoneRecords({
      limit: batchSize,
      offset: offset,
      query: query,
    });

    if (records.length === 0) {
      hasMore = false;
    } else {
      allRecords.push(...records);
      offset += records.length;
      
      // 取得件数がバッチサイズより少ない場合は終了
      if (records.length < batchSize) {
        hasMore = false;
      }
    }
  }

  return allRecords;
}

/**
 * kintoneレコードからレコードIDを抽出
 * @param {Object} record - kintoneレコード
 * @returns {string|null} レコードID（存在しない場合はnull）
 */
export function extractRecordIdFromRecord(record) {
  if (!record || !record.$id) {
    return null;
  }
  const recordId = record.$id.value;
  if (recordId) {
    return String(recordId);
  }
  return null;
}

/**
 * kintoneレコードからメールアドレスを抽出
 * @param {Object} record - kintoneレコード
 * @param {string} emailFieldCode - メールアドレスフィールドコード（デフォルト: 'email'）
 * @returns {string|null} メールアドレス（存在しない場合はnull）
 */
export function extractEmailFromRecord(record, emailFieldCode = 'email') {
  if (!record || !record[emailFieldCode]) {
    return null;
  }
  const email = record[emailFieldCode].value;
  if (email && typeof email === 'string') {
    return email.trim();
  }
  return null;
}

/**
 * メールアドレスの妥当性をチェック
 * @param {string} email - メールアドレス
 * @returns {boolean} 有効な場合はtrue
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  // 基本的なメールアドレス形式チェック
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}
