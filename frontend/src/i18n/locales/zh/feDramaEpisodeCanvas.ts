/** 中文：前端文案：src/pages/drama/episodeCanvas */

export const zhFeDramaEpisodeCanvas = {
  episodeAssetNode: {
    linkedShots: "关联 {length} 个分镜",
    unlink: "取消 {label} 的关联",
  },
  buildEpisodeFlow: {
    shot: "镜 {fragmentId}",
    asset: "资产 {assetId}",
    asset2: "资产",
  },
  episodeFragmentNode: {
    linkedScreenAssets: "关联出境资产",
    asset: "资产",
    noVideoYet: "暂无成片",
    appearsHereAfterGeneration: "生成后显示在此",
    prompt: "提示词",
    shotScriptSeedancePrompt: "分镜脚本 / Seedance 提示词…",
    emptyPrompt: "（空提示词）",
  },
  episodeStoryboardPage: {
    failedLoadEpisode: "加载分集失败",
    saved: "已保存",
    saveFailed: "保存失败",
    backEpisode: "返回分集",
    episode: "分集 {eid}",
    storyboard: "分镜故事板 ·",
    shots: "镜",
    unsaved: " · 未保存",
    assetCanvas: "资产画布",
    saving: "保存中…",
    save: "保存",
    noShotsYet: "暂无分镜",
    goBackEpisodeEditorAdd: "请先回分集编辑页添加分镜",
    loading: "加载中…",
    linkedScreenAssets: "关联出境资产",
    chooseCharactersScenesPropsShot: "选择本镜出场的角色 / 场景 / 道具",
    noAssetsChooseGenerateSome: "暂无可选资产，请先到资产画布生成",
    asset: "资产 {id}",
    asset2: "资产",
  },
} as const;
