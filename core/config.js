// 実行時設定。CLIENT_ID は Google Cloud で OAuthクライアントID を発行後にここへ入れる。
export const CONFIG = {
  // 例: '1234567890-abcdef.apps.googleusercontent.com'
  GOOGLE_CLIENT_ID: '809567814193-vf9k16k4hgj27mrvd02a7q77ukka37um.apps.googleusercontent.com',
  DRIVE_SCOPE: 'https://www.googleapis.com/auth/drive',   // 当面は full（テストモード運用）
  ROOT_FOLDER_ID: '1_x3PWySPT3WiwqbQ2wJJSKm3UH5ppYmC',    // Drive「子供勉強管理」ルート
};
