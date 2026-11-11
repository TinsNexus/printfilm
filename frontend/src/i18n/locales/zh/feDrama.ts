/** 中文：前端文案：src/pages/drama */

export const zhFeDrama = {
  dramaProjectCardMenu: {
    moreActions: "更多操作",
    rename: "重命名",
    delete: "删除",
  },
  episodeEditPromptEditor: {
    describeVisualsDialogueNarrationType: "输入画面描述、对白、旁白；键入 @ 引用资产或插入时长…",
    shotScript: "分镜脚本",
  },
  episodesPage: {
    couldNotOpenStoryboard: "无法进入分镜",
    openingStoryboard: "正在进入分镜…",
  },
  dramaWorkspaceUtils: {
    episode: "第 {episodeNumber} 集",
  },
  dramaStatusNotice: {
    dismiss: "关闭提示",
    cannotReachServiceRightNow: "暂时无法连接服务",
    actionNotCompleted: "操作未完成",
    checkNetworkConnectionTryAgain: "请检查网络连接后重试。如有生成任务进行中，可稍后查看任务状态。",
    viewErrorDetails: "查看错误详情",
  },
  episodeEditContentView: {
    noScriptYetClickEdit: "暂无脚本内容，点击「编辑」开始填写",
    asset: "资产 {assetId}",
  },
  dramaEpisodeCountPopover: {
    episodes: "集",
    customEpisodeCount: "自定义集数",
    ok: "确定",
  },
  dramaEpisodeDir: {
    episode: "第 {epNo} 集",
    unnumbered: "未编号 · {id}",
    episode2: "分集 {id}",
    shots: "{fragCount} 镜",
    episodes: "分集目录",
    noEpisodesYet: "暂无分集",
  },
  dramaImageStyleModal: {
    projectStyle: "项目风格",
    visualStyle: "画面风格",
    chooseStyle: "选择风格",
    styleLibrary: "风格库",
    coverImageSentStyleReference: "封面图会作为画风参考一并提交。模型只借色调、笔触和光影，不会照抄封面里的人物或构图。",
    noStyle: "无风格",
  },
} as const;
