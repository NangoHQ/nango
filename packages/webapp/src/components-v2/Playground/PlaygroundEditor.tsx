import Editor from '@monaco-editor/react';
import { ChevronDown, ChevronUp, Terminal, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '../ui/button';
import { usePlaygroundStore } from '@/store/playground';

import type { editor } from 'monaco-editor';

interface Props {
    loading?: boolean;
}

export const PlaygroundEditor: React.FC<Props> = ({ loading }) => {
    const editorCode = usePlaygroundStore((s) => s.editorCode);
    const consoleOutput = usePlaygroundStore((s) => s.editorConsoleOutput);
    const setEditorCode = usePlaygroundStore((s) => s.setEditorCode);
    const clearConsoleOutput = usePlaygroundStore((s) => s.clearConsoleOutput);

    const [consoleCollapsed, setConsoleCollapsed] = useState(false);
    const consoleEndRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

    useEffect(() => {
        consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [consoleOutput]);

    const handleEditorDidMount = useCallback((ed: editor.IStandaloneCodeEditor) => {
        editorRef.current = ed;
    }, []);

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Editor */}
            <div className="flex-1 min-h-0 border border-border-muted rounded-lg overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-text-tertiary text-body-small-regular">Loading source...</div>
                ) : (
                    <Editor
                        defaultLanguage="typescript"
                        value={editorCode ?? ''}
                        onChange={(value) => setEditorCode(value ?? '')}
                        onMount={handleEditorDidMount}
                        theme="vs-dark"
                        options={{
                            minimap: { enabled: false },
                            fontSize: 13,
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                            tabSize: 4,
                            automaticLayout: true,
                            padding: { top: 12 }
                        }}
                    />
                )}
            </div>

            {/* Console */}
            <div className="flex flex-col border border-border-muted rounded-lg mt-2 overflow-hidden">
                <div
                    className="flex items-center justify-between px-3 py-2 bg-bg-secondary cursor-pointer select-none"
                    onClick={() => setConsoleCollapsed((c) => !c)}
                >
                    <div className="flex items-center gap-2 text-text-secondary text-body-small-medium">
                        <Terminal className="size-4" />
                        Console
                        {consoleOutput.length > 0 && <span className="text-text-tertiary text-body-small-regular">({consoleOutput.length})</span>}
                    </div>
                    <div className="flex items-center gap-1">
                        {consoleOutput.length > 0 && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearConsoleOutput();
                                }}
                            >
                                <Trash2 className="size-3.5" />
                            </Button>
                        )}
                        {consoleCollapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </div>
                </div>
                {!consoleCollapsed && (
                    <div className="h-48 overflow-auto bg-bg-primary p-3 font-mono text-[12px] leading-5 text-text-secondary">
                        {consoleOutput.length === 0 ? (
                            <span className="text-text-tertiary">Output will appear here when you run the function...</span>
                        ) : (
                            consoleOutput.map((line, i) => (
                                <div key={i} className="whitespace-pre-wrap break-all">
                                    {line}
                                </div>
                            ))
                        )}
                        <div ref={consoleEndRef} />
                    </div>
                )}
            </div>
        </div>
    );
};
