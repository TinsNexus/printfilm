/** 画布状态上下文：节点/边、历史、UI 开关与增删操作 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react'
import { dramaApi } from '../../../api/drama'
import type { DramaAsset } from '../../../api/drama'
import { enqueueDramaImageGen } from '../../../lib/dramaImageGenQueue'
import type { ImageGenerationOptions } from '../../../lib/dramaGenerationOptions'
import { getImageStyleId } from '../dramaWorkspaceUtils'
import {
  createEmptyCanvasHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type CanvasHistoryState,
} from './canvasHistory'
import { mergeAssetsWithCanvasLayout, buildNodeDataFromAsset } from './assetsToCanvasNodes'
import {
  CANVAS_NODE_DEFAULT_LABEL,
  canvasKindToAssetType,
  type CanvasAssetNodeData,
  type CanvasNodeKind,
} from './canvasTypes'
import { useCanvasAutoSave } from './useCanvasAutoSave'

type CanvasStoreValue = {
  projectId: number
  nodes: Node<CanvasAssetNodeData>[]
  edges: Edge[]
  loading: boolean
  errorMessage: string
  saveStatusVisible: boolean
  snapToGrid: boolean
  showMinimap: boolean
  canUndo: boolean
  canRedo: boolean
  showNodeSelector: boolean
  setErrorMessage: (msg: string) => void
  toggleSnapToGrid: () => void
  toggleMinimap: () => void
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  addNodeOfKind: (kind: CanvasNodeKind, position: { x: number; y: number }) => Promise<void>
  undo: () => void
  redo: () => void
  pushSnapshot: () => void
  focusNodeId: string | null
  requestFocusNode: (id: string) => void
  clearFocusNode: () => void
  ensureNodeAsset: (nodeId: string) => Promise<number>
  uploadNodeMedia: (nodeId: string, file: File) => Promise<void>
  applyLibraryMediaToNode: (nodeId: string, source: DramaAsset) => Promise<void>
  /** 用最新资产字段同步节点（音色绑定等） */
  syncNodeFromAsset: (nodeId: string, asset: DramaAsset) => void
  generateNodeImage: (
    nodeId: string,
    prompt: string,
    options?: Partial<ImageGenerationOptions>,
  ) => Promise<void>
  updateNodeTextContent: (nodeId: string, textContent: string) => void
  /** 项目级内置画面风格 ID */
  projectImageStyleId: string
}

const CanvasStoreContext = createContext<CanvasStoreValue | null>(null)

type CanvasStoreProviderProps = {
  projectId: number
  children: ReactNode
}

/** 提供画布受控状态与历史操作 */
export function CanvasStoreProvider({ projectId, children }: CanvasStoreProviderProps) {
  const [nodes, setNodes] = useState<Node<CanvasAssetNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [history, setHistory] = useState<CanvasHistoryState>(createEmptyCanvasHistory)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saveStatusVisible, setSaveStatusVisible] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [showMinimap, setShowMinimap] = useState(false)
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
  // projectImageStyleId 项目内置画面风格
  const [projectImageStyleId, setProjectImageStyleId] = useState('')
  const readyRef = useRef(false)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const historyRef = useRef(history)
  nodesRef.current = nodes
  edgesRef.current = edges
  historyRef.current = history

  useEffect(() => {
    let cancelled = false
    readyRef.current = false
    setLoading(true)
    setDirty(false)
    setSaveStatusVisible(false)
    setErrorMessage('')

    Promise.all([
      dramaApi.getCanvas(projectId),
      dramaApi.listAssets(projectId),
      dramaApi.getProject(projectId).catch(() => null),
    ])
      .then(([canvas, assets, project]) => {
        if (cancelled) return
        const { nodes: mergedNodes, edges: mergedEdges } = mergeAssetsWithCanvasLayout(
          assets,
          canvas.nodes,
          canvas.edges,
        )
        setNodes(mergedNodes)
        setEdges(mergedEdges)
        setHistory(createEmptyCanvasHistory())
        setDirty(false)
        if (project) {
          setProjectImageStyleId(getImageStyleId(project.script, project))
        }
        readyRef.current = true
      })
      .catch((err) => {
        if (cancelled) return
        setErrorMessage(err instanceof Error ? err.message : '加载画布失败')
        readyRef.current = true
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      readyRef.current = false
    }
  }, [projectId])

  const markDirty = useCallback(() => {
    if (!readyRef.current) return
    setDirty(true)
    setSaveStatusVisible(false)
  }, [])

  const pushSnapshot = useCallback(() => {
    setHistory((prev) =>
      pushHistory(prev, {
        nodes: nodesRef.current,
        edges: edgesRef.current,
      }),
    )
  }, [])

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const hasRemove = changes.some((c) => c.type === 'remove')
      if (hasRemove) {
        setHistory((prev) =>
          pushHistory(prev, {
            nodes: nodesRef.current,
            edges: edgesRef.current,
          }),
        )
      }
      setNodes((current) => applyNodeChanges(changes, current) as Node<CanvasAssetNodeData>[])
      const structural = changes.some(
        (c) => c.type === 'remove' || c.type === 'add' || c.type === 'replace' || c.type === 'position',
      )
      if (structural) markDirty()
    },
    [markDirty],
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const hasRemove = changes.some((c) => c.type === 'remove')
      if (hasRemove) {
        setHistory((prev) =>
          pushHistory(prev, {
            nodes: nodesRef.current,
            edges: edgesRef.current,
          }),
        )
      }
      setEdges((current) => applyEdgeChanges(changes, current))
      if (changes.some((c) => c.type === 'remove' || c.type === 'add' || c.type === 'replace')) {
        markDirty()
      }
    },
    [markDirty],
  )

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return
      }
      setHistory((prev) =>
        pushHistory(prev, {
          nodes: nodesRef.current,
          edges: edgesRef.current,
        }),
      )
      setEdges((current) => addEdge({ ...connection, id: `e-${Date.now()}` }, current))
      markDirty()
    },
    [markDirty],
  )

  const addNodeOfKind = useCallback(
    async (kind: CanvasNodeKind, position: { x: number; y: number }) => {
      const label = CANVAS_NODE_DEFAULT_LABEL[kind]
      let assetId: number | undefined
      try {
        const asset = await dramaApi.createAsset({
          project_id: projectId,
          type: kind,
          asset_type: canvasKindToAssetType(kind),
          name: label,
          params: {},
        })
        assetId = asset.id
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : '创建资产失败')
        return
      }

      const id = `asset-${assetId}`
      const node: Node<CanvasAssetNodeData> = {
        id,
        type: 'asset',
        position,
        data: {
          kind,
          label,
          assetId,
          textContent: kind === 'text' ? '' : undefined,
          mediaUrl: null,
        },
      }
      /* 回写 canvas_node_id 便于后端关联 */
      void dramaApi
        .updateAsset(assetId, { params: { canvas_node_id: id } })
        .catch(() => undefined)

      setHistory((prev) =>
        pushHistory(prev, {
          nodes: nodesRef.current,
          edges: edgesRef.current,
        }),
      )
      setNodes((current) => [...current, node])
      markDirty()
    },
    [markDirty, projectId],
  )

  /** 确保节点已绑定后端资产，返回 assetId */
  const ensureNodeAsset = useCallback(
    async (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId)
      if (!node) throw new Error('节点不存在')
      if (typeof node.data.assetId === 'number' && node.data.assetId > 0) {
        return node.data.assetId
      }
      const asset = await dramaApi.createAsset({
        project_id: projectId,
        type: node.data.kind,
        asset_type: canvasKindToAssetType(node.data.kind),
        name: node.data.label,
        cover: node.data.mediaUrl || undefined,
        url: node.data.mediaUrl || undefined,
        params: { canvas_node_id: nodeId },
      })
      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, assetId: asset.id } } : n,
        ),
      )
      markDirty()
      return asset.id
    },
    [markDirty, projectId],
  )

  /** 本地上传图片到节点 */
  const uploadNodeMedia = useCallback(
    async (nodeId: string, file: File) => {
      pushSnapshot()
      const assetId = await ensureNodeAsset(nodeId)
      const asset = await dramaApi.uploadAssetMedia(assetId, file)
      const mediaUrl = asset.url || asset.cover || ''
      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, assetId, mediaUrl, generating: false } }
            : n,
        ),
      )
      markDirty()
    },
    [ensureNodeAsset, markDirty, pushSnapshot],
  )

  /** 从全局资产库选用图片并写回节点 */
  const applyLibraryMediaToNode = useCallback(
    async (nodeId: string, source: DramaAsset) => {
      if (!source.url && !source.cover) {
        throw new Error('所选资产没有可用图片')
      }
      pushSnapshot()
      const assetId = await ensureNodeAsset(nodeId)
      const updated = await dramaApi.updateAsset(assetId, {
        url: source.url || source.cover,
        cover: source.cover || source.url,
      })
      const mediaUrl = updated.url || updated.cover || ''
      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, assetId, mediaUrl, generating: false } }
            : n,
        ),
      )
      markDirty()
    },
    [ensureNodeAsset, markDirty, pushSnapshot],
  )

  /** 用最新资产字段同步节点展示（音色、封面、提示词等） */
  const syncNodeFromAsset = useCallback(
    (nodeId: string, asset: DramaAsset) => {
      const next = buildNodeDataFromAsset(asset)
      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  ...next,
                  // 保留本地 generating 状态，避免绑定时闪断
                  generating: n.data.generating,
                },
              }
            : n,
        ),
      )
      markDirty()
    },
    [markDirty],
  )

  /** AI 生图并写回节点 */
  const generateNodeImage = useCallback(
    async (nodeId: string, prompt: string, options?: Partial<ImageGenerationOptions>) => {
      const trimmed = prompt.trim()
      if (!trimmed) throw new Error('请输入提示词')
      pushSnapshot()
      const node = nodesRef.current.find((n) => n.id === nodeId)
      if (!node) throw new Error('节点不存在')

      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, generating: true } } : n,
        ),
      )

      try {
        const assetId = await ensureNodeAsset(nodeId)
        const latest = await enqueueDramaImageGen({
          projectId,
          assetId,
          assetName: node.data.label,
          assetType: node.data.kind,
          prompt: trimmed,
          options: {
            image_style_id: options?.image_style_id || projectImageStyleId || undefined,
            model_id: options?.model_id,
            aspect_ratio: options?.aspect_ratio,
            resolution: options?.resolution,
          },
        })
        const mediaUrl = latest.url || latest.cover || ''
        if (!mediaUrl) throw new Error('生图超时，请重试')
        setNodes((current) =>
          current.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, assetId, mediaUrl, generating: false } }
              : n,
          ),
        )
        markDirty()
      } catch (err) {
        setNodes((current) =>
          current.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, generating: false } } : n,
          ),
        )
        throw err
      }
    },
    [ensureNodeAsset, markDirty, projectId, projectImageStyleId, pushSnapshot],
  )

  /** 更新文本节点内容 */
  const updateNodeTextContent = useCallback(
    (nodeId: string, textContent: string) => {
      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, textContent, label: textContent.slice(0, 24) || n.data.label } }
            : n,
        ),
      )
      markDirty()
    },
    [markDirty],
  )

  const undo = useCallback(() => {
    const result = undoHistory(
      { nodes: nodesRef.current, edges: edgesRef.current },
      historyRef.current,
    )
    if (!result) return
    setNodes(result.snapshot.nodes)
    setEdges(result.snapshot.edges)
    setHistory(result.history)
    markDirty()
  }, [markDirty])

  const redo = useCallback(() => {
    const result = redoHistory(
      { nodes: nodesRef.current, edges: edgesRef.current },
      historyRef.current,
    )
    if (!result) return
    setNodes(result.snapshot.nodes)
    setEdges(result.snapshot.edges)
    setHistory(result.history)
    markDirty()
  }, [markDirty])

  const { flush } = useCanvasAutoSave({
    projectId,
    nodes,
    edges,
    dirty,
    enabled: !loading,
    onSaved: () => {
      setDirty(false)
      setSaveStatusVisible(true)
    },
    onError: (msg) => setErrorMessage(msg),
  })

  /* 页面关闭前尽量刷一次保存 */
  useEffect(() => {
    const onBeforeUnload = () => {
      if (dirty) void flush()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, flush])

  const value = useMemo<CanvasStoreValue>(
    () => ({
      projectId,
      nodes,
      edges,
      loading,
      errorMessage,
      saveStatusVisible,
      snapToGrid,
      showMinimap,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      showNodeSelector: !loading && nodes.length === 0,
      setErrorMessage,
      toggleSnapToGrid: () => setSnapToGrid((v) => !v),
      toggleMinimap: () => setShowMinimap((v) => !v),
      onNodesChange,
      onEdgesChange,
      onConnect,
      addNodeOfKind,
      undo,
      redo,
      pushSnapshot,
      focusNodeId,
      requestFocusNode: (id: string) => setFocusNodeId(id),
      clearFocusNode: () => setFocusNodeId(null),
      ensureNodeAsset,
      uploadNodeMedia,
      applyLibraryMediaToNode,
      syncNodeFromAsset,
      generateNodeImage,
      updateNodeTextContent,
      projectImageStyleId,
    }),
    [
      projectId,
      nodes,
      edges,
      loading,
      errorMessage,
      saveStatusVisible,
      snapToGrid,
      showMinimap,
      history.past.length,
      history.future.length,
      onNodesChange,
      onEdgesChange,
      onConnect,
      addNodeOfKind,
      undo,
      redo,
      pushSnapshot,
      focusNodeId,
      ensureNodeAsset,
      uploadNodeMedia,
      applyLibraryMediaToNode,
      syncNodeFromAsset,
      generateNodeImage,
      updateNodeTextContent,
      projectImageStyleId,
    ],
  )

  return <CanvasStoreContext.Provider value={value}>{children}</CanvasStoreContext.Provider>
}

/** 读取画布状态上下文 */
export function useCanvasStore() {
  const ctx = useContext(CanvasStoreContext)
  if (!ctx) throw new Error('useCanvasStore must be used within CanvasStoreProvider')
  return ctx
}
