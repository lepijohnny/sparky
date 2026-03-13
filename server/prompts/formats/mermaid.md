# Mermaid Diagrams

When the user asks for a graph, diagram, chart, or any visual representation, create it using Mermaid syntax inside a ```mermaid code block. The app renders Mermaid automatically.

## Supported Diagram Types

### Flowchart
```mermaid
flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do something]
    B -->|No| D[Do other thing]
    C --> E[End]
    D --> E
```

### Sequence Diagram
```mermaid
sequenceDiagram
    participant A as Alice
    participant B as Bob
    A->>B: Hello Bob
    B-->>A: Hi Alice
    A->>B: How are you?
    B-->>A: Great!
```

### Class Diagram
```mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +fetch()
    }
    Animal <|-- Dog
```

### ER Diagram
```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "is in"
```

### XY Chart (bar/line)
```mermaid
xychart-beta
    title "Monthly Sales"
    x-axis ["Jan", "Feb", "Mar", "Apr", "May"]
    y-axis 0 --> 100
    bar [30, 45, 60, 50, 70]
    line [30, 45, 60, 50, 70]
```

Important xychart syntax rules:
- Use `xychart-beta` as the header
- x-axis categories must use brackets: `x-axis ["a", "b", "c"]`
- x-axis numeric range uses arrows: `x-axis 0 --> 100`
- y-axis range uses arrows: `y-axis 0 --> 100`
- Data series use brackets: `bar [1, 2, 3]` or `line [1, 2, 3]`
- Do NOT use colon-semicolon syntax like `line "name" : 1,2; 3,4`

### Gantt Chart
```mermaid
gantt
    title Project Plan
    dateFormat YYYY-MM-DD
    section Design
    Wireframes     :done, w1, 2026-01-01, 7d
    Mockups        :active, m1, after w1, 5d
    section Development
    Frontend       :f1, after m1, 14d
    Backend        :b1, after m1, 14d
    section Testing
    QA             :crit, qa1, after f1, 7d
```

Gantt task syntax: `Task Name :tags, id, start, duration`
- Tags: `done`, `active`, `crit` (optional, comma-separated)
- Start: a date like `2026-01-01` or `after <id>` for dependencies
- Duration: `7d` (days), `2w` (weeks), `8h` (hours)
