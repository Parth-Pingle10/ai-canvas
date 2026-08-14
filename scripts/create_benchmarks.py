import json
import os
from pathlib import Path

def make_stroke(stroke_id, points, color="#1e1e1e", width=3, tool="pen"):
    min_x = min(p["x"] for p in points)
    min_y = min(p["y"] for p in points)
    max_x = max(p["x"] for p in points)
    max_y = max(p["y"] for p in points)
    return {
        "id": stroke_id,
        "type": "stroke",
        "points": points,
        "color": color,
        "width": width,
        "tool": tool,
        "opacity": 1.0,
        "bounds": {"minX": min_x, "minY": min_y, "maxX": max_x, "maxY": max_y},
        "createdAt": 1700000000000,
        "version": 1
    }

def make_canvas(name, strokes):
    return {
        "version": 1,
        "canvas": {"name": name},
        "camera": {"x": 200, "y": 150, "zoom": 1},
        "strokes": strokes,
        "aiObjects": [],
        "createdAt": 1700000000000,
        "updatedAt": 1700000000000
    }

def create_benchmarks():
    out_dir = Path("benchmarks")
    out_dir.mkdir(exist_ok=True)

    # 1. math_linear_equation.json: "2x + 5 = 15"
    s1 = make_stroke("s1_2", [{"x": 50, "y": 60}, {"x": 70, "y": 50}, {"x": 50, "y": 90}, {"x": 75, "y": 90}])
    s2 = make_stroke("s1_x1", [{"x": 85, "y": 60}, {"x": 105, "y": 90}])
    s3 = make_stroke("s1_x2", [{"x": 105, "y": 60}, {"x": 85, "y": 90}])
    s4 = make_stroke("s1_p1", [{"x": 125, "y": 55}, {"x": 125, "y": 95}])
    s5 = make_stroke("s1_p2", [{"x": 110, "y": 75}, {"x": 140, "y": 75}])
    s6 = make_stroke("s1_5", [{"x": 170, "y": 55}, {"x": 150, "y": 55}, {"x": 150, "y": 75}, {"x": 170, "y": 80}, {"x": 150, "y": 95}])
    s7 = make_stroke("s1_eq1", [{"x": 185, "y": 70}, {"x": 205, "y": 70}])
    s8 = make_stroke("s1_eq2", [{"x": 185, "y": 80}, {"x": 205, "y": 80}])
    s9 = make_stroke("s1_1", [{"x": 220, "y": 55}, {"x": 220, "y": 95}])
    s10 = make_stroke("s1_5b", [{"x": 245, "y": 55}, {"x": 230, "y": 55}, {"x": 230, "y": 75}, {"x": 250, "y": 80}, {"x": 230, "y": 95}])
    c1 = make_canvas("Linear Equation 2x+5=15", [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10])
    (out_dir / "math_linear_equation.json").write_text(json.dumps(c1, indent=2), encoding="utf-8")

    # 2. math_quadratic.json: "x^2 - 4x + 4 = 0"
    s2_1 = make_stroke("s2_x1", [{"x": 50, "y": 70}, {"x": 70, "y": 100}])
    s2_2 = make_stroke("s2_x2", [{"x": 70, "y": 70}, {"x": 50, "y": 100}])
    s2_3 = make_stroke("s2_pow", [{"x": 75, "y": 60}, {"x": 85, "y": 55}, {"x": 75, "y": 70}, {"x": 87, "y": 70}])
    s2_4 = make_stroke("s2_minus", [{"x": 95, "y": 85}, {"x": 110, "y": 85}])
    s2_5 = make_stroke("s2_4a", [{"x": 125, "y": 65}, {"x": 120, "y": 85}, {"x": 135, "y": 85}])
    s2_6 = make_stroke("s2_4b", [{"x": 130, "y": 65}, {"x": 130, "y": 100}])
    s2_7 = make_stroke("s2_x3", [{"x": 145, "y": 70}, {"x": 165, "y": 100}])
    s2_8 = make_stroke("s2_x4", [{"x": 165, "y": 70}, {"x": 145, "y": 100}])
    s2_9 = make_stroke("s2_plus1", [{"x": 180, "y": 75}, {"x": 180, "y": 95}])
    s2_10 = make_stroke("s2_plus2", [{"x": 170, "y": 85}, {"x": 190, "y": 85}])
    s2_11 = make_stroke("s2_4c", [{"x": 205, "y": 65}, {"x": 200, "y": 85}, {"x": 215, "y": 85}])
    s2_12 = make_stroke("s2_4d", [{"x": 210, "y": 65}, {"x": 210, "y": 100}])
    s2_13 = make_stroke("s2_eq1", [{"x": 225, "y": 80}, {"x": 240, "y": 80}])
    s2_14 = make_stroke("s2_eq2", [{"x": 225, "y": 90}, {"x": 240, "y": 90}])
    s2_15 = make_stroke("s2_zero", [{"x": 255, "y": 70}, {"x": 270, "y": 70}, {"x": 270, "y": 100}, {"x": 255, "y": 100}, {"x": 255, "y": 70}])
    c2 = make_canvas("Quadratic Equation", [s2_1, s2_2, s2_3, s2_4, s2_5, s2_6, s2_7, s2_8, s2_9, s2_10, s2_11, s2_12, s2_13, s2_14, s2_15])
    (out_dir / "math_quadratic.json").write_text(json.dumps(c2, indent=2), encoding="utf-8")

    # 3. geometry_triangle.json: right triangle diagram
    s3_1 = make_stroke("s3_h", [{"x": 50, "y": 200}, {"x": 250, "y": 200}], width=4)
    s3_2 = make_stroke("s3_v", [{"x": 50, "y": 50}, {"x": 50, "y": 200}], width=4)
    s3_3 = make_stroke("s3_diag", [{"x": 50, "y": 50}, {"x": 250, "y": 200}], width=4)
    s3_4 = make_stroke("s3_box1", [{"x": 50, "y": 180}, {"x": 70, "y": 180}, {"x": 70, "y": 200}])
    s3_5 = make_stroke("s3_labelA", [{"x": 40, "y": 45}, {"x": 30, "y": 60}])
    s3_6 = make_stroke("s3_labelB", [{"x": 260, "y": 210}, {"x": 270, "y": 210}])
    c3 = make_canvas("Right Triangle Diagram", [s3_1, s3_2, s3_3, s3_4, s3_5, s3_6])
    (out_dir / "geometry_triangle.json").write_text(json.dumps(c3, indent=2), encoding="utf-8")

    # 4. flowchart_logic.json: flowchart boxes and arrows
    s4_1 = make_stroke("s4_box1", [{"x": 60, "y": 40}, {"x": 160, "y": 40}, {"x": 160, "y": 80}, {"x": 60, "y": 80}, {"x": 60, "y": 40}])
    s4_2 = make_stroke("s4_arr1", [{"x": 110, "y": 80}, {"x": 110, "y": 130}])
    s4_3 = make_stroke("s4_head1", [{"x": 105, "y": 120}, {"x": 110, "y": 130}, {"x": 115, "y": 120}])
    s4_4 = make_stroke("s4_diamond", [{"x": 110, "y": 130}, {"x": 160, "y": 160}, {"x": 110, "y": 190}, {"x": 60, "y": 160}, {"x": 110, "y": 130}])
    s4_5 = make_stroke("s4_arr2", [{"x": 160, "y": 160}, {"x": 220, "y": 160}])
    s4_6 = make_stroke("s4_head2", [{"x": 210, "y": 155}, {"x": 220, "y": 160}, {"x": 210, "y": 165}])
    s4_7 = make_stroke("s4_box2", [{"x": 220, "y": 140}, {"x": 300, "y": 140}, {"x": 300, "y": 180}, {"x": 220, "y": 180}, {"x": 220, "y": 140}])
    c4 = make_canvas("Logic Flowchart", [s4_1, s4_2, s4_3, s4_4, s4_5, s4_6, s4_7])
    (out_dir / "flowchart_logic.json").write_text(json.dumps(c4, indent=2), encoding="utf-8")

    # 5. handwritten_notes.json: bulleted tasks
    s5_1 = make_stroke("s5_b1", [{"x": 50, "y": 50}, {"x": 55, "y": 50}, {"x": 55, "y": 55}, {"x": 50, "y": 55}])
    s5_2 = make_stroke("s5_t1", [{"x": 70, "y": 52}, {"x": 180, "y": 52}])
    s5_3 = make_stroke("s5_b2", [{"x": 50, "y": 80}, {"x": 55, "y": 80}, {"x": 55, "y": 85}, {"x": 50, "y": 85}])
    s5_4 = make_stroke("s5_t2", [{"x": 70, "y": 82}, {"x": 210, "y": 82}])
    s5_5 = make_stroke("s5_b3", [{"x": 50, "y": 110}, {"x": 55, "y": 110}, {"x": 55, "y": 115}, {"x": 50, "y": 115}])
    s5_6 = make_stroke("s5_t3", [{"x": 70, "y": 112}, {"x": 160, "y": 112}])
    c5 = make_canvas("Meeting Notes & Checklist", [s5_1, s5_2, s5_3, s5_4, s5_5, s5_6])
    (out_dir / "handwritten_notes.json").write_text(json.dumps(c5, indent=2), encoding="utf-8")

    print(f"Created 5 benchmark canvases in {out_dir.resolve()}")

if __name__ == "__main__":
    create_benchmarks()
