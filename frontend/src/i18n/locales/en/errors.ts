/** 英文：漫剧生成失败的可读说明（对应 lib/dramaGenError.ts） */

export const enErrors = {
  genErr: {
    slotNamed: '{kind} “{name}”',
    slot: { 角色: 'Character', 场景: 'Scene', 道具: 'Prop', 旁白: 'Narrator', 参考图: 'Reference image', 音色: 'Voice' },
    failed: 'Generation failed',
    empty: {
      message: 'The task did not finish and no specific error was recorded.',
      suggestion: 'Try again later. If it keeps failing, check that your network/proxy can reach TokenFree and that the model channel key in the admin console is valid.',
    },
    timeout: {
      title: 'Upstream timed out',
      suggestion:
        'TokenFree was reachable, but waiting for the image/video exceeded the limit. Try again later. If text works and only images/video time out, the upstream queue is probably slow — it is not a proxy outage.',
    },
    connect: {
      title: 'Cannot reach the image/video service',
      suggestion:
        'This machine cannot reach the upstream right now (often a proxy that does not allow it, or a network drop). Check your network/proxy, then retry, and make sure the TokenFree channel key in the admin console is valid.',
    },
    legacyImage: {
      title: 'Image generation failed',
      message: 'Image generation did not succeed, and this older task did not save the reason (usually an upstream connection failure with an empty error).',
      suggestion: 'Generate again — newer versions record a clear error. If it still fails, check the TokenFree network and key.',
    },
    upstreamAccount: {
      title: 'Platform upstream account overdue',
      message: 'The upstream Seedream model account is out of balance, so the image request was rejected. This is the site’s upstream model account, not your personal wallet.',
      suggestion: 'Ask the site admin to top up in the TokenFree console, then retry image generation.',
    },
    balance: {
      title: 'Insufficient balance',
      message: 'Your balance is too low to continue generating.',
      suggestion: 'Top up first, then retry this task.',
    },
    realPerson: {
      title: 'Reference image may show a real person',
      messageNamed: 'Video service review failed: the reference image of {slot} may contain a real person’s likeness, so generation was refused.',
      suggestionNamed: 'Open “{name}” in the assets on the left, regenerate it or upload an anime/illustrated look, then generate this shot again.',
      whereIndex: ' (item {n} of the submitted content / content[{idx}], usually a character or scene reference)',
      whereUnknown: ' (one of the reference images)',
      message: 'Video service review failed: the input image{where} may contain a real person’s likeness, so generation was refused.',
      suggestion:
        'Open the assets on the left and regenerate the related characters/scenes with AI in an anime or illustrated look (avoid real photos), or upload compliant images, then regenerate this shot.',
    },
    retryExhausted: {
      title: 'Still failing after multiple attempts',
      suggestion:
        'Automatic retries inside this task ran out — you can still click generate again. Fix the real cause (often the real-person review on a reference image) by changing assets or wording, then generate again.',
    },
    prevShot: {
      title: 'Cannot continue from the previous shot',
      message: 'This shot continues from the last frame of the previous shot, but the previous shot did not succeed, so this one never started.',
      suggestion: 'Fix and regenerate the failed previous shot first, then generate the following shots in order.',
    },
    shotChanged: {
      title: 'Shot list was updated',
      message: 'The shots were saved or re-split while generating, so the old task is no longer valid.',
      suggestion: 'Go back to the episode page and generate again from the current shot list; do not retry the old task.',
    },
    textSensitive: {
      title: 'Text did not pass review',
      message: 'The shot script or prompt triggered content-safety review.',
      suggestion: 'Edit the sensitive wording in the shot and try again.',
    },
    audioDownload: {
      title: 'Reference audio cannot be downloaded',
      message: 'The voice reference file URL is invalid or temporarily unreachable.',
      suggestion: 'Check the preview audio bound to the character, then regenerate it or pick another voice and retry.',
    },
    audioShort: {
      title: 'Reference audio too short',
      whereIndex: 'item {n} of the submitted content / content[{idx}] (reference audio, not an image)',
      whereUnknown: 'a character/narrator voice',
      message: 'The video service requires reference audio of at least 1.8 seconds; it is too short here: {where}.',
      suggestion:
        'Open the matching character or narrator asset on the left, regenerate/upload a longer preview audio (2 s or more recommended), then generate this shot again. This is not a reference-image problem.',
    },
    aspect: {
      title: 'Aspect ratio not supported',
      message: 'With a single first frame, this video channel may reject a fixed aspect ratio for image-to-video.',
      suggestion: 'Regenerate this shot; the server will adapt the aspect ratio to the reference image.',
    },
    kieCredits: {
      title: 'Video channel credits exhausted',
      message: 'The upstream account is out of credits, so the video task could not be created (not a reference image or audio length problem).',
      suggestion: 'Ask an admin to top up in the TokenFree console, then regenerate this shot.',
    },
    fileType: {
      title: 'Reference image format not supported',
      message: 'The upstream rejected the reference image: File type not supported (commonly an SVG placeholder or a non-bitmap file).',
      suggestion:
        'Check that the character/scene/prop covers used in this shot are PNG/JPG/WEBP. If one is still an SVG placeholder, regenerate the image or upload a bitmap, then generate the video.',
    },
    rejected: {
      title: 'Video service rejected the request',
      whereIndex: ' (item {n} of the submitted content / content[{idx}])',
      message: 'The upstream returned a parameter or content error, so the task could not be created{where}.',
      suggestion: 'Check this shot’s reference images, reference audio length (must be at least 1.8 s) and script, then retry. If it keeps failing, contact support with the task ID.',
    },
    videoFailed: {
      title: 'Video generation failed',
      suggestion: 'Retry this shot later. If it fails repeatedly, change the reference images or simplify the script.',
    },
    skipped: {
      title: 'Old task skipped',
      message: 'The scheduler found a finished clip for this shot, so it cancelled this duplicate queued task.',
      suggestion:
        'If you were regenerating, check whether a newer task is still running in the queue; if not, click regenerate again. Do not treat this old cancellation as the current failure.',
    },
    cancelled: 'Cancelled',
    interrupted: 'Task interrupted',
    requeue: 'To get a clip, queue it for generation again.',
    plainSuggestion: 'Follow the message above, then regenerate this shot.',
    fallbackSuggestion: 'Check this shot’s reference images and script, then retry.',
  },
} as const
