import Dashboard from './components/Dashboard';

/**
 * 根组件，集成主仪表盘
 */
function App() {
  return (
    <div className="h-screen w-screen flex flex-col">
      <Dashboard />
    </div>
  );
}

export default App;
