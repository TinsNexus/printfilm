import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import DialogHost from './components/ui/DialogHost'
import AuthPage from './pages/AuthPage'
import HistoryPage from './pages/HistoryPage'
import HomePage from './pages/HomePage'
import PricingPage from './pages/PricingPage'
import StudioPage from './pages/StudioPage'
import TemplatesPage from './pages/TemplatesPage'
import CreateProjectPage from './pages/studio/CreateProjectPage'
import StyleConfigPage from './pages/studio/StyleConfigPage'
import StoryboardPage from './pages/studio/StoryboardPage'
import EditorPage from './pages/studio/EditorPage'
import './styles/printfilm.css'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/studio/new" element={<CreateProjectPage />} />
        <Route path="/studio/:id/style" element={<StyleConfigPage />} />
        <Route path="/studio/:id/editor" element={<EditorPage />} />
        <Route path="/studio/:id" element={<StoryboardPage />} />
        <Route path="/studio" element={<StudioPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DialogHost />
    </BrowserRouter>
  )
}
