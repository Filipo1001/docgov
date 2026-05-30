export const dynamic = 'force-static'

export default function MantenimientoPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">

      {/* Backdrop blur overlay */}
      <div className="fixed inset-0 bg-white/60 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative z-10 bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-md w-full p-8 sm:p-10 text-center">

        {/* Icon */}
        <div className="text-5xl mb-5">📢</div>

        {/* Title */}
        <h1 className="text-lg font-bold text-gray-900 mb-6 leading-snug">
          Buenos días a todos.
        </h1>

        {/* Body */}
        <div className="space-y-4 text-sm text-gray-600 leading-relaxed text-left">
          <p>
            El día de hoy se estarán realizando algunos cambios y mejoras en la
            página <span className="font-semibold text-gray-800">"Contratista Digital"</span>,
            con el objetivo de brindar una experiencia más ágil, estable y eficiente
            para todos los usuarios. 🚀
          </p>

          <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex gap-3 items-start">
            <span className="text-xl flex-shrink-0 mt-0.5">🔒</span>
            <p className="text-blue-800 text-sm">
              No te preocupes, tu informe y demás documentos están{' '}
              <span className="font-semibold">protegidos y guardados en varios respaldos.</span>
            </p>
          </div>

          <p className="text-center text-gray-500">
            Agradecemos su comprensión y paciencia. 🙌
          </p>
        </div>

        {/* Divider */}
        <div className="mt-7 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Att.{' '}
            <span className="font-semibold text-gray-600">Felipe Restrepo</span>
          </p>
          <p className="text-[11px] text-gray-300 mt-1">contratistadigital.com</p>
        </div>

      </div>
    </div>
  )
}
