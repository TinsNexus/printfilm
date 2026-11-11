/** 英文：前端文案：src/lib */

export const enFeLib = {
  generationError: {
    videoDidNotPassCopyright: "The video did not pass copyright review",
    videoServiceReportsResultMay: "The video service reports this result may be subject to copyright restrictions, so the video is unavailable for now.",
    requestId: "Request ID: {requestId}",
    adjustPromptReferenceMaterialTry: "Adjust the prompt or reference material and try again. If the material is original or licensed, contact support to review it.",
  },
  clientDownload: {
    untitledWork: "Untitled work",
    downloadFailed: "Download failed ({status})",
    selectCompletedProject: "Select a completed project",
  },
  creationApiError: {
    creationServiceApiNotLoaded: "The creation service API is not loaded yet. Restart the backend and try again.",
    creationSessionDoesNotExist: "This creation session does not exist or was deleted. Go back to My shorts or start a new chat.",
  },
  dramaGenerationOptions: {
    auto: "Auto",
    auto2: "Auto · {resolution}",
    imageModel: "Image model",
  },
  agentSkillSelection: {
    noSkill: "No Skill",
  },
  segmentDuration: {
    eachDurationMustBetweenSeconds: "Each @duration must be between {SEGMENT_DURATION_MIN} and {SEGMENT_DURATION_MAX} seconds",
    totalShotDurationCannotExceed: "Total shot duration cannot exceed {SHOT_DURATION_MAX} seconds (currently {total}s)",
  },
  canvasNodeMedia: {
    untitled: "Untitled",
  },
  imageTextStoryboard: {
    creationSettings: "Creation settings",
    scriptStoryboard: "Script & storyboard",
    visualsVoiceOver: "Visuals & voice-over",
    preview: "Preview",
  },
  billingError: {
    teamSpendingLimited: "Team spending is limited",
    checkLimitTeamWalletTeam: "{message}. Check your limit in the team wallet; the team balance and top-ups are managed by the owner.",
    got: "Got it",
  },
  publicCapabilities: {
    voiceGenerationTemporarilyUnavailableChoose: "Voice generation is temporarily unavailable. Choose an existing voice or upload audio.",
  },
  dramaAssetImage: {
    regenerateLook: "Regenerate look",
    generateLook: "Generate look",
  },
  apiError: {
    requestFailed: "Request failed",
  },
  toolRunDetails: {
    videoGeneration: "Video generation",
    imageGeneration: "Image generation",
    audioGeneration: "Audio generation",
    textGeneration: "Text generation",
    taskQueuedResultsWillUpdate: "The task is queued; results will update automatically.",
    taskGeneratingResultsWillUpdate: "The task is generating; results will update automatically.",
    taskFinishedButThereNo: "The task finished, but there is no media to preview.",
    generationFailed: "Generation failed.",
    taskWasCancelled: "The task was cancelled.",
    taskStatus: "Task status: {status}",
    generationRecord: "Generation record",
  },
  dramaAssetImageVersions: {
    upload: "Upload",
    aiGenerated: "AI generated",
    previousVersions: "Previous versions",
  },
  characterVoiceGenerate: {
    voiceDescriptionEmpty: "The voice description is empty",
    voice: "{name} voice",
    voiceSynthesisFailed: "Voice synthesis failed",
  },
  dramaVideoGenerationOptions: {
    videoModel: "Video model",
  },
  dramaUsage: {
    calls: "· {calls} calls",
    imagesVideos: "{charge} · {image_gens} images · {video_gens} videos{calls}",
  },
} as const;
