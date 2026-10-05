PYTHON ?= python3
DEVICE ?= cpu
RUN_DIR ?= results/gears_medium
RUN_NAME ?= gears_medium
CELL_CAP ?= 128
BATCH_SIZE ?= 64
EPOCHS ?= 20
LR_STEP_SIZE ?= 5
LR_GAMMA ?= 0.5
RUNTIME_VARIANT ?= batch-corrected
LOSS_IMPLEMENTATION ?= vectorized

.PHONY: prepare check-preparation smoke train verify report reproduce

prepare:
	$(PYTHON) prepare_project06.py

check-preparation:
	$(PYTHON) prepare_project06.py --offline --output-dir results/preparation_check --check-against results

smoke:
	$(PYTHON) train_project06.py --device $(DEVICE) --cell-cap $(CELL_CAP) --batch-size $(BATCH_SIZE) --output-dir $(RUN_DIR)_smoke --run-name $(RUN_NAME) --runtime-variant $(RUNTIME_VARIANT) --loss-implementation $(LOSS_IMPLEMENTATION) --smoke-only

train:
	$(PYTHON) train_project06.py --device $(DEVICE) --cell-cap $(CELL_CAP) --batch-size $(BATCH_SIZE) --epochs $(EPOCHS) --output-dir $(RUN_DIR) --run-name $(RUN_NAME) --lr-step-size $(LR_STEP_SIZE) --lr-gamma $(LR_GAMMA) --runtime-variant $(RUNTIME_VARIANT) --loss-implementation $(LOSS_IMPLEMENTATION)

verify:
	$(PYTHON) train_project06.py --output-dir $(RUN_DIR) --verify-checkpoint

report:
	$(PYTHON) report_project06.py --run-dir $(RUN_DIR)

# Recursive recipes keep the dependent stages sequential even under make -j.
reproduce: prepare
	$(MAKE) train
	$(MAKE) verify
	$(MAKE) report
