import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Solar Site Precheck render error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="app-error" role="alert">
        <div className="app-error__card">
          <span aria-hidden="true">!</span>
          <div>
            <h1>画面を表示できませんでした</h1>
            <p>入力内容はブラウザに残っています。ページを再読み込みして、もう一度お試しください。</p>
          </div>
          <button type="button" onClick={() => window.location.reload()}>
            ページを再読み込み
          </button>
        </div>
      </main>
    )
  }
}
