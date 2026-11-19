import { Route, Routes } from 'react-router-dom';
import { Config } from './pages/Config';
import { Demo } from './pages/Demo';
import { Mobile } from './pages/Mobile';
import { MobileEnroll } from './pages/MobileEnroll';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Demo />} />
      <Route path="/m/:id" element={<Mobile />} />
      <Route path="/config" element={<Config />} />
      <Route path="/m-enroll" element={<MobileEnroll />} />
    </Routes>
  );
}
