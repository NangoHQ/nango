import type { Translation } from './en';

const ja: Translation = {
    common: {
        dialogLabel: 'インテグレーションを接続',
        close: '閉じる',
        loading: '読み込み中',
        back: '戻る',
        finish: '完了',
        tryAgain: '再試行',
        connecting: '接続中...',
        connect: '接続',
        viewGuide: '接続ガイドを見る',
        needHelp: 'お困りですか？'
    },
    integrationsList: {
        title: 'インテグレーションを選択',
        description: '以下のリストから API インテグレーションを選択してください。',
        noIntegrations: 'インテグレーションが見つかりません。',
        noIntegrationsDescription: 'この環境ではインテグレーションが設定されていません。Nango ダッシュボードで最初のインテグレーションを追加してください。',
        connectTo: '{provider} に接続',
        error: '設定の読み込み中にエラーが発生しました'
    },
    go: {
        linkAccount: '{provider} アカウントを連携',
        fieldDocumentation: '{field} のドキュメントを見る',
        connect: '接続',
        success: '成功しました！',
        successMessage: '{provider} インテグレーションの設定が完了しました。',
        connectionFailed: '接続に失敗しました',
        connectionErrorGeneric: '認証中にエラーが発生しました。サポートチームまでお問い合わせください。',
        showErrorDetails: 'エラーの詳細を表示',
        hideErrorDetails: 'エラーの詳細を非表示',
        tryAgain: 'もう一度お試しください',
        backToList: 'インテグレーション一覧に戻る',
        willConnect: '{provider} に接続します。',
        popupWarning: 'ポップアップが開きます。ブラウザがポップアップをブロックしないようにしてください。',
        popupBlocked: '認証ポップアップがブラウザによってブロックされました。ポップアップを許可してください。',
        popupClosed: '認証ポップアップが処理の完了前に閉じられました。もう一度お試しください。',
        closeTab: 'このタブを閉じても問題ありません。',
        authorizationFailed: '認証に失敗しました。',
        invalidCredentials: '{provider} が認証情報を検証できませんでした。入力内容を確認して、もう一度お試しください。',
        resourceCapped: '許可されている接続数の上限に達しました。管理者にお問い合わせください。',
        invalidPreconfigured: '管理者が事前設定したフィールドが無効です。サポートまでお問い合わせください。'
    }
};

export default ja;
